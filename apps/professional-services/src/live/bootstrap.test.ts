import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import { DecideConflictCheckResponseSchema } from "../generated/ontobff/connect-es/oui/professional_services/v1/reference_pb";
import {
  composeProfessionalServicesApplication,
  createProfessionalServicesGeneratedTransport,
} from "./bootstrap";

const serviceType =
  "oui.professional_services.v1.ProfessionalServicesFrontendService";

describe("professional-services generated transport binding", () => {
  it("hoists the generated synchronous conflictCheck outcome to the IR output path", async () => {
    const generatedResponse = create(DecideConflictCheckResponseSchema, {
      auditId: "audit-1",
      outcome: {
        case: "conflictCheck",
        value: {
          id: "conflict-check-1",
          version: "2",
          status: "cleared",
          result: "clear",
        },
      },
    });
    const transport = createProfessionalServicesGeneratedTransport({
      getConflictCheck: vi.fn(),
      getConflictDecisionContext: vi.fn(),
      decideConflictCheck: vi.fn(async () => generatedResponse),
    });

    const outcome = await transport[`${serviceType}.DecideConflictCheck`]?.(
      {},
      {
        headers: {},
        signal: new AbortController().signal,
      },
    );

    expect(outcome).toMatchObject({
      audit_id: "audit-1",
      conflict_check: {
        id: "conflict-check-1",
        version: "2",
        status: "cleared",
        result: "clear",
      },
    });
  });

  it("maps IR inputs and generated decision outputs without changing shared OUI", async () => {
    const getConflictDecisionContext = vi.fn(async () => ({
      conflictCheck: {
        id: "conflict-check-1",
        version: "1",
        status: "pending",
      },
      evidence: [
        {
          id: "evidence-1",
          label: "Ownership search",
          requiredBeforeDecision: true,
        },
      ],
      alternatives: [],
      policyExplanation: "Review the evidence.",
    }));
    const decideConflictCheck = vi.fn(async () => ({
      auditId: "audit-1",
      outcome: {
        case: "operation",
        value: {
          operationId: "operation-1",
          status: "succeeded",
          resumeToken: "",
          auditId: "audit-1",
        },
      },
    }));
    const transport = createProfessionalServicesGeneratedTransport({
      getConflictCheck: vi.fn(),
      getConflictDecisionContext,
      decideConflictCheck,
    });
    const options = {
      headers: { authorization: "Bearer test-only" },
      signal: new AbortController().signal,
    };

    const context = await transport[
      `${serviceType}.GetConflictDecisionContext`
    ]?.({ conflict_check_id: "conflict-check-1" }, options);
    expect(getConflictDecisionContext).toHaveBeenCalledWith(
      { conflictCheckId: "conflict-check-1" },
      options,
    );
    expect(context).toMatchObject({
      conflict_check: { id: "conflict-check-1", version: "1" },
      evidence: [{ required_before_decision: true }],
      policy_explanation: "Review the evidence.",
    });

    const outcome = await transport[`${serviceType}.DecideConflictCheck`]?.(
      {
        conflict_check_id: "conflict-check-1",
        expected_version: "1",
        alternative_id: "clear",
        reason: "",
      },
      options,
    );
    expect(decideConflictCheck).toHaveBeenCalledWith(
      {
        conflictCheckId: "conflict-check-1",
        expectedVersion: "1",
        alternativeId: "clear",
        reason: "",
      },
      options,
    );
    expect(outcome).toMatchObject({
      audit_id: "audit-1",
      operation: {
        operation_id: "operation-1",
        status: "succeeded",
        audit_id: "audit-1",
      },
    });
  });

  it("executes OUI queries through the generated client with exact contract headers", async () => {
    const getConflictDecisionContext = vi.fn(
      async (
        _input: unknown,
        _options?: { headers?: HeadersInit; signal?: AbortSignal },
      ) => {
        void _input;
        void _options;
        return {
          conflictCheck: {
            id: "conflict-check-1",
            version: "1",
            status: "pending",
          },
          evidence: [],
          alternatives: [],
          policyExplanation: "Review the evidence.",
        };
      },
    );
    const composition = composeProfessionalServicesApplication(
      {
        getConflictCheck: vi.fn(),
        getConflictDecisionContext,
        decideConflictCheck: vi.fn(),
      },
      "browser-token",
    );

    await composition.operationRuntime.query(
      "query:get-conflict-decision-context",
      { conflict_check_id: "conflict-check-1" },
    );

    const options = getConflictDecisionContext.mock.calls[0]?.[1];
    const headers = new Headers(options?.headers);
    expect(headers.get("authorization")).toBe("Bearer browser-token");
    expect(headers.get("x-oui-application")).toBe(
      "application:professional-services-conflict-decision",
    );
    expect(headers.get("x-oui-ir-digest")).toBe(
      "sha256:1fc86cb7e3809b6e00c836b28ab80108558987451679c900dcdd0f843e4a6eac",
    );
    expect(headers.get("x-oui-bff-plan-digest")).toBe(
      "sha256:538c38279bd2eef60ef4707a6da6c677f898db5a886e0a40cb5f6bf000aca827",
    );
    expect(headers.get("x-oui-descriptor-digest")).toBe(
      "sha256:0212fe0eb0527899f0213bcdf907bf66faaf322baa84fd1bd596982561d6073d",
    );
    expect(headers.get("x-oui-contract-digest")).toBe(
      "sha256:8fb5500c939441fdb5676b49ce1d1c239f65ec534b4074eb8ae78e26ca294a30",
    );
    expect(composition.applicationBootstrap.runtime.session).toMatchObject({
      actor: { id: "actor-reviewer", displayName: "Conflict Reviewer" },
      capabilities: ["conflict_check.read", "conflict_check.decide"],
    });
  });
});
