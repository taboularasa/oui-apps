import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertApplicationIr } from "@oui/core";
import { OUIOperationError, mapOperationError } from "./errors";
import { createOperationRuntime } from "./runtime";
import {
  TestConnectClient,
  createConnectClientRegistry,
  type TestConnectStreamHandler,
  type TestConnectHandler,
} from "./transport";

const fixtureDirectory = fileURLToPath(
  new URL("../../../fixtures/reference/", import.meta.url),
);
const application = assertApplicationIr(
  readFileSync(`${fixtureDirectory}application.ir.json`, "utf8"),
);
const serviceType = "oui.reference.v1.ReferenceFrontendService";
const session = {
  actor: {
    id: "actor:test",
    displayName: "Test actor",
  },
  tenant: null,
  capabilities: ["permission:item.update", "permission:proposal.decide"],
  locale: "en-US",
  timeZone: "America/Chicago",
} as const;

describe("Connect operation runtime", () => {
  it("registers generated clients, injects metadata, and creates deterministic keys", async () => {
    const { client, runtime } = createRuntime({
      "oui.reference.v1.ReferenceFrontendService.ListItems": ({ input }) => ({
        items: [],
        input,
      }),
    });
    const first = runtime.queryKey("query:list-items", {
      query: "compressor",
      statuses: ["open"],
      page_token: "",
      ignored: "first",
    });
    const second = runtime.queryKey("query:list-items", {
      statuses: ["open"],
      page_token: "",
      query: "compressor",
      ignored: "second",
    });

    expect(first).toEqual(second);
    expect(
      runtime.queryKey("query:list-items", {
        query: "compressor",
        statuses: ["open"],
        page_token: "",
        sort: { field: "title", direction: "ascending" },
      }),
    ).not.toEqual(
      runtime.queryKey("query:list-items", {
        query: "compressor",
        statuses: ["open"],
        page_token: "",
        sort: { field: "title", direction: "descending" },
      }),
    );
    expect(
      runtime.queryKey("query:list-items", {
        query: "compressor",
        statuses: ["open"],
        page_token: "",
        sort: "title",
        direction: "ascending",
      }),
    ).not.toEqual(
      runtime.queryKey("query:list-items", {
        query: "compressor",
        statuses: ["open"],
        page_token: "",
        sort: "title",
        direction: "descending",
      }),
    );
    await expect(
      runtime.query("query:list-items", {
        query: "compressor",
        statuses: ["open"],
        page_token: "",
      }),
    ).resolves.toMatchObject({ items: [] });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.headers).toMatchObject({
      authorization: "Bearer test-token",
      traceparent: "00-test-trace",
      tracestate: "vendor=test",
      "x-correlation-id": "correlation:test",
      "accept-language": "en-US",
      "x-oui-time-zone": "America/Chicago",
      "connect-timeout-ms": "5000",
      "x-oui-application": "application:reference",
      "x-oui-ir-version": "1.0.0",
      "x-oui-ir-digest":
        "sha256:fbf4d2513ed30f8d0c84c7cf2697a59fd0b109895afaba5b8c439f7896302439",
      "x-oui-bff-plan-digest": "sha256:plan",
      "x-oui-descriptor-digest": "sha256:descriptor",
      "x-oui-contract-digest": "sha256:contract",
      "x-oui-runtime-version": "1.0.0",
    });
  });

  it("retries safe unavailable queries but never consequential commands", async () => {
    let queryAttempts = 0;
    let commandAttempts = 0;
    const { runtime } = createRuntime({
      "oui.reference.v1.ReferenceFrontendService.ListItems": () => {
        queryAttempts += 1;
        if (queryAttempts < 3) {
          throw { code: "unavailable", message: "Try again." };
        }
        return { items: [] };
      },
      "oui.reference.v1.ReferenceFrontendService.UpdateItem": () => {
        commandAttempts += 1;
        throw { code: "unavailable", message: "Do not retry a command." };
      },
    });

    await expect(
      runtime.query("query:list-items", {
        query: "",
        statuses: [],
        page_token: "",
      }),
    ).resolves.toEqual({ items: [] });
    expect(queryAttempts).toBe(3);

    await expect(
      runtime.command("command:update-item", {
        item_id: "item:1",
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(commandAttempts).toBe(1);
  });

  it("requires idempotency, propagates it, and invalidates declared queries", async () => {
    const { client, runtime } = createRuntime({
      "oui.reference.v1.ReferenceFrontendService.DecideProposal": () => ({
        audit_id: "audit:1",
      }),
    });
    const decisionKey = runtime.queryKey("query:get-decision-context", {
      proposal_id: "proposal:1",
    });
    runtime.queryClient.setQueryData(decisionKey, { proposal: {} });

    await expect(
      runtime.command("command:decide-proposal", {
        proposal_id: "proposal:1",
      }),
    ).rejects.toMatchObject({
      kind: "validation",
    });

    await expect(
      runtime.command(
        "command:decide-proposal",
        { proposal_id: "proposal:1" },
        { idempotencyKey: "idempotency:decision:1" },
      ),
    ).resolves.toEqual({ audit_id: "audit:1" });
    expect(client.requests[0]?.headers["idempotency-key"]).toBe(
      "idempotency:decision:1",
    );
    expect(runtime.queryClient.getQueryState(decisionKey)?.isInvalidated).toBe(
      true,
    );
  });

  it("cancels commands through the test transport", async () => {
    const { runtime } = createRuntime({
      "oui.reference.v1.ReferenceFrontendService.UpdateItem": ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    });
    const controller = new AbortController();
    const operation = runtime.command(
      "command:update-item",
      { item_id: "item:1" },
      { signal: controller.signal },
    );
    controller.abort();

    await expect(operation).rejects.toMatchObject({
      kind: "cancelled",
      retryable: false,
    });
  });

  it("streams ordered operation events and forwards resume input", async () => {
    const { client, runtime } = createRuntime(
      {},
      {
        "oui.reference.v1.ReferenceFrontendService.WatchOperation":
          async function* ({ input }) {
            yield { sequence: 2n, input };
            yield { sequence: 3n, status: "succeeded" };
          },
      },
    );
    const events = [];

    for await (const event of runtime.stream<{
      readonly sequence: bigint;
    }>(
      "service:reference",
      "oui.reference.v1.ReferenceFrontendService.WatchOperation",
      { operation_id: "operation:1", resume_token: "resume:1" },
    )) {
      events.push(event);
    }

    expect(events.map(({ sequence }) => sequence)).toEqual([2n, 3n]);
    expect(client.streamRequests[0]).toMatchObject({
      input: { operation_id: "operation:1", resume_token: "resume:1" },
      headers: {
        "x-oui-contract-digest": "sha256:contract",
        authorization: "Bearer test-token",
      },
    });
  });

  it.each([
    {
      code: "invalid_argument",
      details: undefined,
      kind: "validation",
    },
    {
      code: "permission_denied",
      details: undefined,
      kind: "permission",
    },
    { code: "already_exists", details: undefined, kind: "conflict" },
    {
      code: "aborted",
      details: [{ type: "oui.reference.v1.StaleStateDetail" }],
      kind: "stale_state",
    },
    {
      code: "failed_precondition",
      details: [{ type: "oui.reference.v1.StaleStateDetail" }],
      kind: "stale_state",
    },
    { code: "aborted", details: undefined, kind: "conflict" },
    { code: "unavailable", details: undefined, kind: "unavailable" },
    { code: "internal", details: undefined, kind: "internal" },
  ] as const)(
    "maps $code failures to stable $kind errors",
    ({ code, details, kind }) => {
      const error = mapOperationError("query:test", {
        code,
        details,
        message: "Typed failure",
        correlationId: "correlation:error",
      });

      expect(error).toBeInstanceOf(OUIOperationError);
      expect(error).toMatchObject({
        kind,
        correlationId: "correlation:error",
      });
    },
  );
});

function createRuntime(
  handlers: Readonly<Record<string, TestConnectHandler>>,
  streamHandlers: Readonly<Record<string, TestConnectStreamHandler>> = {},
) {
  const clients = createConnectClientRegistry();
  const client = new TestConnectClient(serviceType, handlers, streamHandlers);
  clients.register({
    serviceBindingId: "service:reference",
    client,
  });
  const runtime = createOperationRuntime({
    application,
    clients,
    session,
    identity: {
      applicationId: "application:reference",
      irVersion: "1.0.0",
      irDigest:
        "sha256:fbf4d2513ed30f8d0c84c7cf2697a59fd0b109895afaba5b8c439f7896302439",
      bffPlanDigest: "sha256:plan",
      descriptorDigest: "sha256:descriptor",
      contractDigest: "sha256:contract",
      runtimeVersion: "1.0.0",
    },
    metadata: {
      getMetadata: () => ({
        accessToken: "test-token",
        traceparent: "00-test-trace",
        tracestate: "vendor=test",
        correlationId: "correlation:test",
        deadlineMs: 5_000,
      }),
    },
  });
  return { client, runtime };
}
