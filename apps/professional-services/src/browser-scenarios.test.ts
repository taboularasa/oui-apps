import { describe, expect, it, vi } from "vitest";
import {
  runAuthorityAndInvariantScenarios,
  runApprovalAndConcurrencyScenarios,
  runContractMismatchScenario,
  runEvidenceAndReasonScenarios,
} from "./browser-scenarios";

describe("professional-services Chromium scenarios", () => {
  it("loads governed evidence and observes reason-required rejection", async () => {
    const client = {
      getConflictDecisionContext: vi.fn(async () => ({
        conflictCheck: {
          id: "conflict-check-1",
          version: "1",
          status: "pending",
        },
        evidence: [{ id: "evidence-1" }, { id: "evidence-2" }],
        alternatives: [
          { id: "clear", reasonRequired: false },
          { id: "waiver_obtained", reasonRequired: true },
          { id: "declined", reasonRequired: true },
        ],
        policyExplanation: "Review all evidence.",
      })),
      decideConflictCheck: vi.fn(async () => {
        throw { code: "invalid_argument", details: [] };
      }),
    };

    const results = await runEvidenceAndReasonScenarios(
      client,
      async () => new Headers(),
    );

    expect(results).toEqual([
      { name: "evidence context loads through generated Connect", ok: true },
      { name: "reason-required rejection is enforced by Go", ok: true },
    ]);
    expect(client.decideConflictCheck).toHaveBeenCalledWith(
      {
        conflictCheckId: "conflict-check-1",
        expectedVersion: "1",
        alternativeId: "waiver_obtained",
        reason: "",
      },
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("observes authorization and invariant denials from Go", async () => {
    const decideConflictCheck = vi.fn(
      async (
        input: { readonly conflictCheckId: string },
        options?: { headers?: HeadersInit },
      ) => {
        const suffix = new Headers(options?.headers).get("x-token-suffix");
        if (suffix === "-viewer") throw { code: "permission_denied" };
        if (input.conflictCheckId === "conflict-check-2") {
          throw { code: "failed_precondition" };
        }
        if (input.conflictCheckId === "conflict-check-3") {
          throw { code: "failed_precondition" };
        }
        throw new Error("unexpected request");
      },
    );
    const results = await runAuthorityAndInvariantScenarios(
      { decideConflictCheck },
      async (options) =>
        new Headers({ "x-token-suffix": options?.tokenSuffix ?? "" }),
    );

    expect(results).toEqual([
      { name: "authorization denial is enforced by Go", ok: true },
      { name: "required evidence invariant is enforced by Go", ok: true },
      { name: "pending-state invariant is enforced by Go", ok: true },
    ]);
  });

  it("observes approval, replay, conflict, and stale recovery", async () => {
    const authoritative = {
      id: "conflict-check-1",
      version: "1",
      status: "pending",
      result: "",
    };
    const outcome = {
      auditId: "audit-approval",
      outcome: {
        case: "operation" as const,
        value: {
          operationId: "operation-approval",
          status: "succeeded",
          resumeToken: "",
          auditId: "audit-approval",
        },
      },
    };
    const decideConflictCheck = vi.fn(
      async (
        input: {
          readonly alternativeId: string;
          readonly conflictCheckId: string;
        },
        options?: { headers?: HeadersInit },
      ) => {
        const headers = new Headers(options?.headers);
        const key = headers.get("idempotency-key");
        if (key === "browser-approval" && input.alternativeId === "clear") {
          authoritative.version = "2";
          authoritative.status = "cleared";
          authoritative.result = "clear";
          return outcome;
        }
        if (key === "browser-approval") throw { code: "already_exists" };
        throw { code: "aborted" };
      },
    );
    const results = await runApprovalAndConcurrencyScenarios(
      {
        decideConflictCheck,
        getConflictCheck: vi.fn(async () => ({ conflictCheck: authoritative })),
      },
      async (options) =>
        new Headers({
          "idempotency-key": options?.idempotencyKey ?? "",
          "x-correlation-id": options?.correlationId ?? "",
        }),
    );

    expect(results).toEqual([
      {
        name: "approval returns correlated audit and operation identities",
        ok: true,
      },
      {
        name: "exact idempotent replay returns the original outcome",
        ok: true,
      },
      { name: "changed-input idempotency reuse conflicts", ok: true },
      {
        name: "stale state is rejected and authoritative state reloads",
        ok: true,
      },
    ]);
  });

  it("observes typed per-request contract mismatch with correlation", async () => {
    const results = await runContractMismatchScenario(
      {
        getConflictCheck: vi.fn(async () => {
          throw {
            code: "failed_precondition",
            correlationId: "browser-correlation-mismatch",
            details: [
              {
                type: "oui.professional_services.v1.PreconditionErrorDetail",
                value: {
                  reason: "contract_mismatch",
                  correlationId: "browser-correlation-mismatch",
                },
              },
            ],
          };
        }),
      },
      async () => new Headers(),
    );

    expect(results).toEqual([
      {
        name: "per-request contract mismatch fails closed with correlation",
        ok: true,
      },
    ]);
  });
});
