import type { SessionContext } from "@oui/core";
import { createOperationHeaders } from "@oui/data";
import {
  runApprovalAndConcurrencyScenarios,
  runAuthorityAndInvariantScenarios,
  runContractMismatchScenario,
  runEvidenceAndReasonScenarios,
  type BrowserScenarioHeaders,
  type BrowserScenarioResult,
} from "./browser-scenarios";
import { professionalServicesContractIdentity } from "./compatibility";
import { createReferenceBrowserClient } from "./generated/ontobff/connect-es/reference_client";

const statusElement = document.querySelector("#uat-status");
const logElement = document.querySelector("#uat-log");
const token = new URL(window.location.href).searchParams.get("token");
const session: SessionContext = Object.freeze({
  actor: null,
  tenant: null,
  capabilities: [],
  locale: navigator.language || "en-US",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
});

async function main(): Promise<void> {
  if (token === null || token === "") {
    throw new Error("The professional-services browser UAT token is required.");
  }
  const client = createReferenceBrowserClient(window.location.origin);
  const headers = async (
    options: BrowserScenarioHeaders = {},
  ): Promise<Headers> => {
    const identity = {
      ...professionalServicesContractIdentity,
      ...(options.mismatchedIrDigest === undefined
        ? {}
        : { irDigest: options.mismatchedIrDigest }),
    };
    return new Headers(
      await createOperationHeaders({
        identity,
        session,
        metadata: {
          getMetadata: () => ({
            accessToken: `${token}${options.tokenSuffix ?? ""}`,
            correlationId:
              options.correlationId ??
              `browser-correlation-${crypto.randomUUID()}`,
            deadlineMs: 10_000,
          }),
        },
        ...(options.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: options.idempotencyKey }),
        ...(options.expectedVersion === undefined
          ? {}
          : { expectedVersion: options.expectedVersion }),
      }),
    );
  };

  const results: BrowserScenarioResult[] = [];
  results.push(...(await runEvidenceAndReasonScenarios(client, headers)));
  results.push(...(await runAuthorityAndInvariantScenarios(client, headers)));
  results.push(...(await runContractMismatchScenario(client, headers)));
  results.push(...(await runApprovalAndConcurrencyScenarios(client, headers)));
  render(results);
}

function render(results: readonly BrowserScenarioResult[]): void {
  const failed = results.filter(({ ok }) => !ok);
  if (logElement !== null) {
    logElement.textContent = [
      ...results.map(
        ({ name, ok, detail }) =>
          `${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `\n      ${detail}`}`,
      ),
      "",
      `${results.length - failed.length} passed, ${failed.length} failed`,
    ].join("\n");
  }
  if (statusElement !== null) {
    statusElement.setAttribute(
      "data-state",
      failed.length === 0 ? "passed" : "failed",
    );
    statusElement.textContent = failed.length === 0 ? "passed" : "failed";
  }
}

void main().catch((error: unknown) => {
  if (logElement !== null) {
    logElement.textContent =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
  if (statusElement !== null) {
    statusElement.setAttribute("data-state", "failed");
    statusElement.textContent = "failed";
  }
});
