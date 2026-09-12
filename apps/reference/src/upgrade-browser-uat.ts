import type { SessionContext } from "@oui/core";
import { createOperationHeaders } from "@oui/data";
import {
  CompatibilityAdmissionError,
  negotiateReferenceCompatibility,
  type BffCompatibility,
} from "./live/compatibility";
import { createReferenceBrowserClient } from "./generated/ontobff/connect-es/reference_client";

declare const OUI_COMPATIBILITY_CLIENT_RELEASE: string;

const statusElement = document.querySelector("#compatibility-uat-status");
const resultElement = document.querySelector("#compatibility-uat-result");
const parameters = new URL(window.location.href).searchParams;
const token = parameters.get("token");
const mode = parameters.get("mode") ?? "verify";
const expectedTitle =
  parameters.get("expectedTitle") ?? "Milestone 8 preserved";
let operationalRequests = 0;
const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (!request.url.endsWith("/GetCompatibility")) operationalRequests += 1;
  return originalFetch(request);
};

async function run() {
  if (token === null || token === "") {
    throw new Error("Compatibility UAT credential is missing.");
  }
  const client = createReferenceBrowserClient(window.location.origin);
  const compatibility = (await client.getCompatibility(
    {},
  )) as unknown as BffCompatibility;
  let identity;
  try {
    identity = negotiateReferenceCompatibility(
      compatibility,
      OUI_COMPATIBILITY_CLIENT_RELEASE,
    );
  } catch (error) {
    if (
      mode === "refuse" &&
      error instanceof CompatibilityAdmissionError &&
      operationalRequests === 0
    ) {
      return {
        schemaVersion: "oui-compatibility-browser-result/v1",
        status: "refused",
        clientRelease: OUI_COMPATIBILITY_CLIENT_RELEASE,
        operationalRequests,
        diagnostics: error.diagnostics,
      };
    }
    throw error;
  }
  if (mode === "refuse") {
    throw new Error("The incompatible client was incorrectly admitted.");
  }
  const session: SessionContext = {
    actor: null,
    tenant: null,
    capabilities: [],
    locale: "en-US",
    timeZone: "UTC",
  };
  const headers = async (idempotencyKey?: string) =>
    new Headers(
      await createOperationHeaders({
        identity,
        session,
        metadata: {
          getMetadata: () => ({
            accessToken: token,
            correlationId: crypto.randomUUID(),
            traceparent:
              "00-44444444444444444444444444444444-4444444444444444-01",
            tracestate: "oui=compatibility-uat",
            deadlineMs: 10_000,
          }),
        },
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    );
  let item = (
    await client.getItem({ itemId: "uat-item" }, { headers: await headers() })
  ).item;
  if (item === undefined) throw new Error("The UAT item is missing.");
  if (mode === "update") {
    const response = await client.updateItem(
      {
        itemId: item.id,
        expectedVersion: item.version,
        changes: { title: expectedTitle },
        updateMask: { paths: ["title"] },
      },
      { headers: await headers("compatibility-uat-title-update") },
    );
    if (response.item === undefined || response.auditId === "") {
      throw new Error(
        "The upgrade seed command omitted state or audit identity.",
      );
    }
    item = response.item;
  }
  if (item.title !== expectedTitle) {
    throw new Error(
      `State preservation failed: expected ${expectedTitle}, received ${item.title}.`,
    );
  }
  return {
    schemaVersion: "oui-compatibility-browser-result/v1",
    status: "passed",
    clientRelease: OUI_COMPATIBILITY_CLIENT_RELEASE,
    serverRelease: identity.serverRelease,
    versionPairId: identity.versionPairId,
    contractDigest: identity.contractDigest,
    operationalRequests,
    state: { id: item.id, version: item.version, title: item.title },
  };
}

run()
  .then((result) => {
    if (resultElement !== null)
      resultElement.textContent = JSON.stringify(result);
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
