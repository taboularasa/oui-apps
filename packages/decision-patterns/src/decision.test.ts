import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { assertApplicationIr } from "@oui/core";
import {
  compileDecisionPattern,
  decisionConfirmationMessage,
  evaluateDecisionPreconditions,
  materializeDecisionCommandInput,
  materializeDecisionQueryInput,
} from "./compiler";
import { createDecisionMachine } from "./machine";
import { isTerminalOperationStatus } from "./view";

const fixtureDirectory = fileURLToPath(
  new URL("../../../fixtures/reference/", import.meta.url),
);
const application = assertApplicationIr(
  readFileSync(`${fixtureDirectory}application.ir.json`, "utf8"),
);
const interaction = application.interactions["interaction:proposal-decision"];
if (interaction === undefined) {
  throw new Error("Expected the reference decision interaction.");
}
const session = {
  actor: {
    id: "actor:reviewer",
    displayName: "Review actor",
  },
  tenant: null,
  capabilities: [
    "permission:proposal.view",
    "permission:proposal.decide",
    "permission:proposal.reject",
  ],
  locale: "en-US",
  timeZone: "UTC",
} as const;

describe("evidence-backed decision pattern", () => {
  it("compiles evidence, policy, authority, alternatives, and preconditions", () => {
    const model = compileDecisionPattern(application, interaction, session);

    expect(model.subjectPath).toBe("proposal");
    expect(model.evidencePath).toBe("evidence");
    expect(model.evidenceRequiredBeforeAction).toBe(true);
    expect(model.policyPath).toBe("policy_explanation");
    expect(model.authority).toEqual({
      actorId: "actor:reviewer",
      actorName: "Review actor",
      available: true,
    });
    expect(
      model.alternatives.map(
        ({ label, reason, confirmationRequired, available }) => ({
          label,
          reason,
          confirmationRequired,
          available,
        }),
      ),
    ).toEqual([
      {
        label: "Approve",
        reason: "optional",
        confirmationRequired: true,
        available: true,
      },
      {
        label: "Reject",
        reason: "required",
        confirmationRequired: true,
        available: true,
      },
    ]);
    expect(model.preconditions).toEqual([
      {
        id: "precondition:proposal.pending",
        kind: "field_equals",
        field: "status",
        value: "pending",
      },
    ]);
  });

  it("keeps permission-unavailable alternatives visible with an explanation", () => {
    const model = compileDecisionPattern(application, interaction, {
      ...session,
      capabilities: ["permission:proposal.view", "permission:proposal.decide"],
    });
    const reject = model.alternatives.find(({ label }) => label === "Reject");

    expect(reject).toMatchObject({
      available: false,
      unavailableExplanation:
        "You can review this proposal but cannot reject it.",
    });
  });

  it("materializes typed query and command inputs from route, context, and choice", () => {
    const model = compileDecisionPattern(application, interaction, session);
    const reject = model.alternatives.find(({ label }) => label === "Reject");
    if (reject === undefined) {
      throw new Error("Expected the reject alternative.");
    }

    expect(
      materializeDecisionQueryInput(model, {
        proposalId: "proposal:42",
      }),
    ).toEqual({
      proposal_id: "proposal:42",
    });
    expect(
      materializeDecisionCommandInput(
        reject,
        {
          proposal: {
            version: "version:42",
          },
        },
        {
          proposalId: "proposal:42",
        },
        "Insufficient evidence",
      ),
    ).toEqual({
      proposal_id: "proposal:42",
      expected_version: "version:42",
      alternative_id: "reject",
      reason: "Insufficient evidence",
    });
    expect(decisionConfirmationMessage(reject)).toBe(
      "Confirm this decision. It cannot be undone.",
    );
  });

  it("evaluates state preconditions against the decision subject", () => {
    const model = compileDecisionPattern(application, interaction, session);

    expect(evaluateDecisionPreconditions(model, { status: "pending" })).toEqual(
      [
        expect.objectContaining({
          satisfied: true,
        }),
      ],
    );
    expect(
      evaluateDecisionPreconditions(model, { status: "approved" }),
    ).toEqual([
      expect.objectContaining({
        satisfied: false,
        explanation: "This decision requires status to be pending.",
      }),
    ]);
  });

  it("orchestrates evidence, reason, confirmation, conflict, and success", () => {
    const machine = createDecisionMachine({
      evidenceRequired: true,
      alternatives: {
        reject: {
          available: true,
          reasonRequired: true,
          confirmationRequired: true,
        },
      },
    });
    const actor = createActor(machine);
    actor.start();

    actor.send({ type: "SELECT", alternativeId: "reject" });
    actor.send({ type: "REQUEST" });
    expect(actor.getSnapshot().value).toBe("reviewing");
    actor.send({ type: "EVIDENCE_REVIEWED", reviewed: true });
    actor.send({ type: "REQUEST" });
    expect(actor.getSnapshot().value).toBe("reviewing");
    actor.send({ type: "SET_REASON", reason: "Insufficient evidence" });
    actor.send({ type: "REQUEST" });
    expect(actor.getSnapshot().value).toBe("confirming");
    actor.send({ type: "CONFIRM" });
    expect(actor.getSnapshot().value).toBe("submitting");
    actor.send({ type: "CONFLICT", error: new Error("stale") });
    expect(actor.getSnapshot().value).toBe("conflict");
    actor.send({ type: "REFRESH" });
    expect(actor.getSnapshot().value).toBe("reviewing");

    actor.send({ type: "EVIDENCE_REVIEWED", reviewed: true });
    actor.send({ type: "SELECT", alternativeId: "reject" });
    actor.send({ type: "SET_REASON", reason: "Insufficient evidence" });
    actor.send({ type: "REQUEST" });
    actor.send({ type: "CONFIRM" });
    actor.send({
      type: "RESOLVE",
      output: {
        operation: {
          next_state: "rejected",
        },
      },
    });
    expect(actor.getSnapshot()).toMatchObject({
      value: "success",
      context: {
        outcome: {
          operation: {
            next_state: "rejected",
          },
        },
      },
    });
  });

  it("treats every declared terminal operation status as complete", () => {
    expect(
      ["succeeded", "failed", "cancelled", "expired"].map(
        isTerminalOperationStatus,
      ),
    ).toEqual([true, true, true, true]);
    expect(
      ["unspecified", "accepted", "running"].map(isTerminalOperationStatus),
    ).toEqual([false, false, false]);
  });
});
