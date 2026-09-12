import type { SessionContext } from "@oui/core";
import { createOperationHeaders } from "@oui/data";
import {
  admitReferenceCompatibility,
  type BffCompatibility,
} from "./live/compatibility";
import { createReferenceBrowserClient } from "./generated/ontobff/connect-es/reference_client";
import { OperationStatus } from "./generated/ontobff/connect-es/oui/reference/v1/reference_pb";

interface RequestObservation {
  readonly correlationId: string;
  readonly traceparent: string;
  readonly procedure: string;
  readonly status: number;
}

const statusElement = document.querySelector("#deployment-smoke-status");
const resultElement = document.querySelector("#deployment-smoke-result");
const token = new URL(window.location.href).searchParams.get("token");
const requestObservations: RequestObservation[] = [];
const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const response = await originalFetch(request);
  const correlationId = request.headers.get("x-correlation-id") ?? "";
  if (correlationId.startsWith("deployment-")) {
    const responseCorrelation = response.headers.get("x-correlation-id") ?? "";
    if (responseCorrelation !== correlationId) {
      throw new Error(
        "The generated Go response changed correlation identity.",
      );
    }
    requestObservations.push({
      correlationId,
      traceparent: request.headers.get("traceparent") ?? "",
      procedure: new URL(request.url).pathname,
      status: response.status,
    });
  }
  return response;
};

async function main() {
  if (!token) throw new Error("The deployment smoke credential is missing.");
  const client = createReferenceBrowserClient(window.location.origin);
  const compatibility = (await client.getCompatibility(
    {},
  )) as unknown as BffCompatibility;
  const identity = admitReferenceCompatibility(compatibility);
  const session: SessionContext = {
    actor: null,
    tenant: null,
    capabilities: [],
    locale: navigator.language || "en-US",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
  const headers = async (
    correlationId: string,
    traceparent: string,
    idempotencyKey?: string,
  ) =>
    new Headers(
      await createOperationHeaders({
        identity,
        session,
        metadata: {
          getMetadata: () => ({
            accessToken: token,
            correlationId,
            traceparent,
            tracestate: "oui=private-deployment-uat",
            deadlineMs: 10_000,
          }),
        },
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    );
  const queryCorrelation = "deployment-query-correlation";
  const queryTrace = "00-11111111111111111111111111111111-1111111111111111-01";
  const listed = await client.listItems(
    { pageSize: 1 },
    { headers: await headers(queryCorrelation, queryTrace) },
  );
  if (listed.items.length !== 1 || listed.items[0]?.id !== "uat-item") {
    throw new Error("The deployment query returned the wrong exact result.");
  }

  const commandCorrelation = "deployment-command-correlation";
  const commandTrace =
    "00-22222222222222222222222222222222-2222222222222222-01";
  const decision = await client.decideProposal(
    {
      proposalId: "browser-proposal",
      expectedVersion: "v1",
      alternativeId: "approve",
    },
    {
      headers: await headers(
        commandCorrelation,
        commandTrace,
        "deployment-smoke-decision",
      ),
    },
  );
  if (decision.outcome.case !== "operation" || decision.auditId === "") {
    throw new Error(
      "The deployment command omitted operation or audit identity.",
    );
  }
  const operation = decision.outcome.value;
  const streamCorrelation = "deployment-stream-correlation";
  const streamTrace = "00-33333333333333333333333333333333-3333333333333333-01";
  const events = [];
  for await (const event of client.watchOperation(
    {
      operationId: operation.operationId,
      resumeToken: operation.resumeToken,
    },
    { headers: await headers(streamCorrelation, streamTrace) },
  )) {
    events.push(event);
  }
  if (
    events.length !== 3 ||
    events.at(-1)?.status !== OperationStatus.OPERATION_STATUS_SUCCEEDED
  ) {
    throw new Error("The deployment operation stream did not succeed exactly.");
  }
  const requiredCorrelations = [
    queryCorrelation,
    commandCorrelation,
    streamCorrelation,
  ];
  if (
    requestObservations.length !== 3 ||
    !requiredCorrelations.every(
      (correlationId) =>
        requestObservations.filter(
          (observation) => observation.correlationId === correlationId,
        ).length === 1,
    )
  ) {
    throw new Error("The browser smoke request evidence is incomplete.");
  }
  return {
    schemaVersion: "oui-deployment-browser-smoke/v1",
    query: {
      correlationId: queryCorrelation,
      responseDigest: await digestJson(listed),
    },
    command: {
      correlationId: commandCorrelation,
      responseDigest: await digestJson(decision),
      auditId: decision.auditId,
    },
    operationStream: {
      correlationId: streamCorrelation,
      operationId: operation.operationId,
      eventCount: events.length,
      terminalStatus: "succeeded",
    },
    telemetry: {
      traces: requestObservations.map(
        ({ correlationId, traceparent, procedure }) => ({
          correlationId,
          traceparent,
          procedure,
        }),
      ),
      metrics: requestObservations.map(
        ({ correlationId, procedure, status }) => ({
          correlationId,
          name: "ontobff_requests_total",
          procedure,
          status,
          value: 1,
        }),
      ),
    },
  };
}

async function digestJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value, bigintJson));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function bigintJson(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

main()
  .then((result) => {
    if (resultElement !== null) {
      resultElement.textContent = JSON.stringify(result);
    }
    statusElement?.setAttribute("data-state", "passed");
    if (statusElement !== null) statusElement.textContent = "passed";
  })
  .catch((error: unknown) => {
    if (resultElement !== null) {
      resultElement.textContent = JSON.stringify({ error: String(error) });
    }
    statusElement?.setAttribute("data-state", "failed");
    if (statusElement !== null) statusElement.textContent = "failed";
  });
