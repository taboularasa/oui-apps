import { describe, expect, it, vi } from "vitest";
import {
  ItemSortField,
  ItemStatus,
  OperationStatus,
  SortDirection,
} from "../generated/ontobff/connect-es/oui/reference/v1/reference_pb";
import { createReferenceGeneratedConnectClientForTest } from "./generated-connect-client";

const signal = new AbortController().signal;
const headers = { "x-adapter-test": "generated-client" };

describe("reference GeneratedConnectClient adapter", () => {
  it("submits only the released title update field", async () => {
    const updateItem = vi.fn(async () => ({ auditId: "audit:update" }));
    const client = createReferenceGeneratedConnectClientForTest(
      generatedClient({ updateItem }),
    );

    await client.unary({
      method: "oui.reference.v1.ReferenceFrontendService.UpdateItem",
      input: {
        item_id: "item:1",
        expected_version: "v1",
        changes: {
          title: "Updated title",
          status: "done",
          owner: "actor:2",
          dueAt: "2026-08-20T14:00:00Z",
        },
        update_mask: ["title", "status", "owner", "dueAt"],
      },
      headers,
      signal,
    });

    expect(updateItem).toHaveBeenCalledWith(
      {
        itemId: "item:1",
        expectedVersion: "v1",
        changes: { title: "Updated title" },
        updateMask: { paths: ["title"] },
      },
      { headers, signal },
    );
  });

  it("preserves live decision evidence summaries for the decision pattern", async () => {
    const getDecisionContext = vi.fn(async () => ({
      evidence: [
        {
          id: "evidence:1",
          label: "Diagnostic",
          summary: "Compressor winding is open.",
          requiredBeforeDecision: true,
        },
      ],
      alternatives: [],
      policyExplanation: "Review required.",
    }));
    const client = createReferenceGeneratedConnectClientForTest(
      generatedClient({ getDecisionContext }),
    );

    await expect(
      client.unary({
        method: "oui.reference.v1.ReferenceFrontendService.GetDecisionContext",
        input: { proposal_id: "proposal:1" },
        headers,
        signal,
      }),
    ).resolves.toMatchObject({
      evidence: [
        {
          label: "Diagnostic",
          summary: "Compressor winding is open.",
        },
      ],
    });
  });

  it("maps nested sorting and Protobuf JSON names through generated methods", async () => {
    const listItems = vi.fn(async () => ({
      items: [
        {
          id: "item:1",
          version: "v1",
          title: "First",
          status: ItemStatus.ITEM_STATUS_OPEN,
          history: [],
        },
      ],
      nextPageToken: "cursor:next",
      resultVersion: "result:v1",
    }));
    const client = createReferenceGeneratedConnectClientForTest(
      generatedClient({ listItems }),
    );

    await expect(
      client.unary({
        method: "oui.reference.v1.ReferenceFrontendService.ListItems",
        input: {
          page_size: 25,
          page_token: "",
          query: "first",
          statuses: ["open"],
          sort: "title",
          direction: "descending",
        },
        headers,
        signal,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: "item:1",
          version: "v1",
          title: "First",
          status: "open",
          owner: undefined,
          dueAt: undefined,
          history: [],
        },
      ],
      next_page_token: "cursor:next",
      result_version: "result:v1",
    });
    expect(listItems).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 25,
        statuses: [ItemStatus.ITEM_STATUS_OPEN],
        sort: {
          field: ItemSortField.ITEM_SORT_FIELD_TITLE,
          direction: SortDirection.SORT_DIRECTION_DESCENDING,
        },
      }),
      { headers, signal },
    );
  });

  it("preserves the generated decision oneof as exactly one OUI outcome", async () => {
    const decideProposal = vi.fn(async () => ({
      auditId: "audit:1",
      outcome: {
        case: "operation" as const,
        value: {
          operationId: "operation:1",
          status: OperationStatus.OPERATION_STATUS_ACCEPTED,
          resumeToken: "resume:1",
          auditId: "audit:1",
        },
      },
    }));
    const client = createReferenceGeneratedConnectClientForTest(
      generatedClient({ decideProposal }),
    );

    const output = await client.unary({
      method: "oui.reference.v1.ReferenceFrontendService.DecideProposal",
      input: {
        proposal_id: "proposal:1",
        expected_version: "v1",
        alternative_id: "approve",
        reason: "",
      },
      headers,
      signal,
    });

    expect(output).toEqual({
      operation: {
        operation_id: "operation:1",
        accepted_at: undefined,
        status: "accepted",
        resume_token: "resume:1",
        audit_id: "audit:1",
      },
      audit_id: "audit:1",
    });
    expect(output).not.toHaveProperty("proposal");
  });

  it("maps operation streams and resumes from the supplied token", async () => {
    const watchOperation = vi.fn(async function* () {
      yield {
        operationId: "operation:1",
        sequence: 2n,
        status: OperationStatus.OPERATION_STATUS_RUNNING,
        progress: 0.5,
        message: "Applying decision",
        resumeToken: "resume:2",
      };
    });
    const client = createReferenceGeneratedConnectClientForTest(
      generatedClient({ watchOperation }),
    );
    const events = [];

    if (client.serverStream === undefined) {
      throw new Error("Expected the generated server stream adapter.");
    }
    for await (const event of client.serverStream({
      method: "oui.reference.v1.ReferenceFrontendService.WatchOperation",
      input: { operation_id: "operation:1", resume_token: "resume:1" },
      headers,
      signal,
    })) {
      events.push(event);
    }

    expect(watchOperation).toHaveBeenCalledWith(
      { operationId: "operation:1", resumeToken: "resume:1" },
      { headers, signal },
    );
    expect(events).toEqual([
      expect.objectContaining({
        operation_id: "operation:1",
        sequence: 2n,
        status: "running",
        resume_token: "resume:2",
      }),
    ]);
  });
});

function generatedClient(overrides: Record<string, unknown>) {
  const unsupported = async () => {
    throw new Error("not used by this test");
  };
  return {
    service: {},
    getCompatibility: unsupported,
    getSession: unsupported,
    listItems: unsupported,
    getItem: unsupported,
    updateItem: unsupported,
    getDecisionContext: unsupported,
    decideProposal: unsupported,
    watchOperation: unsupported,
    ...overrides,
  } as never;
}
