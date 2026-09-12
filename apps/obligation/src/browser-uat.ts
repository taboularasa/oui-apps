/**
 * Obligation workbench browser UAT.
 *
 * Runs in Chromium against the live generated Go service, from that service's
 * own origin. Every request is built by OUI's own `createOperationHeaders`
 * from `@oui/data` — not by hand — so the artifact identity chain, locale,
 * time zone, idempotency key, and expected version all travel exactly as a
 * compiled OUI application would send them.
 *
 * Assertions target semantics the semantic compiler emitted from layer 0 /
 * layer 1 ontology bindings: the authorization expression, both validation
 * rules, the idempotency guard, the concurrency request field, and the
 * declared business invariant.
 */
import type { SessionContext } from "@oui/core";
import {
  createOperationHeaders,
  type OperationMetadataProvider,
} from "@oui/data";
import {
  admitObligationCompatibility,
  CompatibilityAdmissionError,
  obligationContractIdentity,
  type BffCompatibility,
} from "./compatibility";
import {
  createReferenceBrowserClient,
  ReferenceConnectError,
} from "./generated/ontobff/connect-es/reference_client";

const results: { name: string; ok: boolean; detail?: string }[] = [];
let awaitingCredential = false;

function record(name: string, ok: boolean, detail?: string): void {
  results.push(ok ? { name, ok } : { name, ok, detail: detail ?? "" });
}

async function expectConnectError(
  name: string,
  code: string,
  run: () => Promise<unknown>,
  inspect?: (error: ReferenceConnectError) => string | undefined,
): Promise<void> {
  try {
    await run();
    record(name, false, `expected ${code}, request succeeded`);
  } catch (error) {
    if (!(error instanceof ReferenceConnectError)) {
      record(name, false, `expected a Connect error, got ${String(error)}`);
      return;
    }
    if (error.code !== code) {
      record(name, false, `expected ${code}, got ${error.code}`);
      return;
    }
    const complaint = inspect?.(error);
    record(name, complaint === undefined, complaint);
  }
}

/**
 * Without a credential the page still explains itself and shows the served
 * contract identity, rather than throwing at someone who simply opened the
 * deployment's URL.
 */
async function describeWithoutCredential(): Promise<void> {
  const client = createReferenceBrowserClient(window.location.origin);
  const served = (await client.getCompatibility(
    {},
  )) as unknown as BffCompatibility;
  if (logElement !== null) {
    logElement.textContent = [
      "Obligation workbench — a domain-neutral application compiled from",
      "layer 0 / layer 1 ontology concepts and generated into a Go service.",
      "",
      "This page runs the browser UAT. It needs the demo credential:",
      "    /uat/?token=<ENCOUNTER_BFF_TEST_TOKEN>",
      "",
      "Served contract identity:",
      `  application       ${served.applicationId}`,
      `  IR version        ${served.irVersion}`,
      `  IR digest         ${served.irDigest}`,
      `  BFF plan digest   ${served.bffPlanDigest}`,
      `  descriptor digest ${served.descriptorDigest}`,
      `  contract digest   ${served.contractDigest}`,
      `  capabilities      ${served.capabilities.join(", ")}`,
    ].join("\n");
  }
  awaitingCredential = true;
  statusElement?.setAttribute("data-state", "awaiting-credential");
  if (statusElement !== null) statusElement.textContent = "awaiting credential";
}

async function main(): Promise<void> {
  const token = new URL(window.location.href).searchParams.get("token");
  if (token === null || token === "") {
    await describeWithoutCredential();
    return;
  }

  const client = createReferenceBrowserClient(window.location.origin);

  // 1. Fetch the served compatibility manifest and admit it before mounting.
  const served = (await client.getCompatibility(
    {},
  )) as unknown as BffCompatibility;
  const identity = admitObligationCompatibility(served);
  record("compatibility admission accepts the served contract", true);

  // 2. A deliberate mismatch must fail closed, using OUI's own admission.
  try {
    admitObligationCompatibility({
      ...served,
      irDigest: "sha256:" + "0".repeat(64),
    });
    record(
      "compatibility admission fails closed on a digest mismatch",
      false,
      "admitted a mismatched IR digest",
    );
  } catch (error) {
    record(
      "compatibility admission fails closed on a digest mismatch",
      error instanceof CompatibilityAdmissionError,
      error instanceof CompatibilityAdmissionError ? undefined : String(error),
    );
  }

  const session: SessionContext = {
    actor: null,
    tenant: null,
    capabilities: [],
    locale: navigator.language || "en-US",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
  const metadata: OperationMetadataProvider = Object.freeze({
    getMetadata: () => ({
      accessToken: token,
      correlationId: `oui-obligation-${crypto.randomUUID()}`,
      deadlineMs: 10_000,
    }),
  });

  // Every operational request below is headed by OUI's runtime.
  const headers = async (options?: {
    idempotencyKey?: string;
    expectedVersion?: string;
  }): Promise<Headers> =>
    new Headers(
      await createOperationHeaders({
        identity,
        session,
        metadata,
        ...(options?.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: options.idempotencyKey }),
        ...(options?.expectedVersion === undefined
          ? {}
          : { expectedVersion: options.expectedVersion }),
      }),
    );
  // 3. Session.
  const sessionResult = await client.getSession(
    {},
    { headers: await headers() },
  );
  record(
    "session discloses the authenticated actor",
    sessionResult.actor?.id === "actor-inspector",
    `actor = ${sessionResult.actor?.id ?? "none"}`,
  );
  record(
    "session discloses the compiled close capability",
    sessionResult.capabilities.includes("exception.close"),
    `capabilities = ${sessionResult.capabilities.join(", ")}`,
  );

  // 4. Collections page through the shared helper.
  const assets = await client.listAssets(
    { pageSize: 2 },
    { headers: await headers() },
  );
  record(
    "collection paginates through the generated client",
    assets.assets.length === 2 && assets.nextPageToken !== "",
    `${assets.assets.length} assets, token = ${assets.nextPageToken}`,
  );

  // 5. Tenant isolation.
  await expectConnectError(
    "another tenant's asset never reaches the browser",
    "not_found",
    async () =>
      client.getAsset({ assetId: "asset-4" }, { headers: await headers() }),
  );

  // 6. A to-many composition: the asset detail carries its obligations, and
  //    each child derives its own state.
  const asset = await client.getAsset(
    { assetId: "asset-1" },
    { headers: await headers() },
  );
  record(
    "asset detail carries its obligations as a child collection",
    asset.obligations.length === 2,
    `${asset.obligations.length} obligations`,
  );
  record(
    "each child obligation derives its own due state",
    asset.obligations.every((obligation) => obligation.dueState !== ""),
    asset.obligations.map((o) => `${o.id}=${o.dueState}`).join(", "),
  );

  // 7. A child collection is bounded, and discloses that it was truncated.
  const bounded = await client.getAsset(
    { assetId: "asset-1", obligationsPageSize: 1 },
    { headers: await headers() },
  );
  record(
    "a child collection honours its page bound",
    bounded.obligations.length === 1 && bounded.obligationsNextPageToken !== "",
    `${bounded.obligations.length} obligations, token = ${bounded.obligationsNextPageToken}`,
  );

  // 8. Derived state is computed, never stored.
  const overdue = await client.listObligations(
    { dueState: "overdue" },
    { headers: await headers() },
  );
  record(
    "derived state filters by comparison rather than equality",
    overdue.obligations.length === 1 &&
      overdue.obligations[0]?.id === "obligation-3",
    `${overdue.obligations.length} overdue`,
  );
  await expectConnectError(
    "a filter outside the compiled state vocabulary is refused",
    "invalid_argument",
    async () =>
      client.listObligations(
        { dueState: "invented" },
        { headers: await headers() },
      ),
    (error) =>
      error
        .validationDetail()
        ?.violations.some((v) => v.reason === "due_state_unknown")
        ? undefined
        : "expected due_state_unknown",
  );

  // 9. The declared required rule refuses an empty value.
  await expectConnectError(
    "compiled required rule returns a typed field violation",
    "invalid_argument",
    async () =>
      client.raiseException(
        {
          draft: {
            obligationId: "obligation-1",
            nextAction: "",
            ownerId: "actor-inspector",
          },
        },
        { headers: await headers({ idempotencyKey: "browser-required" }) },
      ),
    (error) =>
      error
        .validationDetail()
        ?.violations.some((v) => v.reason === "next_action_required")
        ? undefined
        : "expected next_action_required",
  );

  // 10. An action the browser would hide is still refused server-side.
  await expectConnectError(
    "an action the browser would hide is still refused server-side",
    "permission_denied",
    async () =>
      client.closeException(
        {
          exceptionId: "exception-2",
          expectedVersion: "1",
          closure: { status: "closed" },
          updateMask: ["status"],
        },
        {
          headers: new Headers(
            await createOperationHeaders({
              identity,
              session,
              metadata: Object.freeze({
                getMetadata: () => ({
                  accessToken: `${token}-viewer`,
                  correlationId: `oui-obligation-${crypto.randomUUID()}`,
                  deadlineMs: 10_000,
                }),
              }),
              idempotencyKey: "browser-viewer-close",
            }),
          ),
        },
      ),
  );

  // 11. The cross-resource invariant refuses a close with missing proof.
  const beforeCapture = await client.getException(
    { exceptionId: "exception-1" },
    { headers: await headers() },
  );
  record(
    "outstanding required proof is disclosed before an attempt",
    beforeCapture.outstandingRequiredProofs === 1,
    `outstanding = ${beforeCapture.outstandingRequiredProofs}`,
  );
  await expectConnectError(
    "declared invariant blocks closing with missing proof",
    "failed_precondition",
    async () =>
      client.closeException(
        {
          exceptionId: "exception-1",
          expectedVersion: "1",
          closure: { status: "closed" },
          updateMask: ["status"],
        },
        { headers: await headers({ idempotencyKey: "browser-blocked" }) },
      ),
  );

  // 12. Capturing the outstanding proof admits the close.
  const captured = await client.captureProof(
    {
      proofId: "proof-2",
      expectedVersion: "1",
      capture: { capturedDate: "2026-08-16" },
    },
    { headers: await headers({ idempotencyKey: "browser-capture" }) },
  );
  record(
    "capturing proof advances its version and returns an audit identity",
    captured.proof?.version === "2" && captured.auditId !== "",
    `version = ${captured.proof?.version}, audit = ${captured.auditId}`,
  );

  const closed = await client.closeException(
    {
      exceptionId: "exception-1",
      expectedVersion: "1",
      closure: { status: "closed" },
      updateMask: ["status"],
    },
    { headers: await headers({ idempotencyKey: "browser-close" }) },
  );
  record(
    "the close is admitted once its required proof is captured",
    closed.exception?.status === "closed",
    `status = ${closed.exception?.status}`,
  );

  // 13. Idempotent replay and conflict.
  const replayed = await client.captureProof(
    {
      proofId: "proof-2",
      expectedVersion: "1",
      capture: { capturedDate: "2026-08-16" },
    },
    { headers: await headers({ idempotencyKey: "browser-capture" }) },
  );
  record(
    "exact replay returns the original authoritative outcome",
    replayed.auditId === captured.auditId,
    `audit = ${replayed.auditId}`,
  );
  await expectConnectError(
    "idempotency key reuse with changed input conflicts",
    "already_exists",
    async () =>
      client.captureProof(
        {
          proofId: "proof-2",
          expectedVersion: "1",
          capture: { capturedDate: "2026-08-15" },
        },
        { headers: await headers({ idempotencyKey: "browser-capture" }) },
      ),
  );

  // 14. A terminal exception cannot be reopened.
  await expectConnectError(
    "a terminal exception cannot be reopened",
    "failed_precondition",
    async () =>
      client.closeException(
        {
          exceptionId: "exception-3",
          expectedVersion: "1",
          closure: { status: "open" },
          updateMask: ["status"],
        },
        { headers: await headers({ idempotencyKey: "browser-reopen" }) },
      ),
  );

  // 15. The committed close is durable across requests.
  const reloaded = await client.getException(
    { exceptionId: "exception-1" },
    { headers: await headers() },
  );
  record(
    "the closed state is durable across requests",
    reloaded.exception?.status === "closed",
    `status = ${reloaded.exception?.status}`,
  );
}

const statusElement = document.querySelector("#uat-status");
const logElement = document.querySelector("#uat-log");

main()
  .then(() => {
    if (awaitingCredential) {
      return;
    }
    const failed = results.filter((result) => !result.ok);
    const summary = results
      .map(
        (result) =>
          `${result.ok ? "PASS" : "FAIL"}  ${result.name}${
            result.detail === undefined ? "" : `\n      ${result.detail}`
          }`,
      )
      .join("\n");
    if (logElement !== null) {
      logElement.textContent = `${summary}\n\n${results.length - failed.length} passed, ${failed.length} failed`;
    }
    if (statusElement !== null) {
      statusElement.setAttribute(
        "data-state",
        failed.length === 0 ? "passed" : "failed",
      );
      statusElement.setAttribute(
        "data-passed",
        String(results.length - failed.length),
      );
      statusElement.setAttribute("data-failed", String(failed.length));
      statusElement.textContent = failed.length === 0 ? "passed" : "failed";
    }
  })
  .catch((error: unknown) => {
    if (logElement !== null) {
      logElement.textContent = `${String(error)}\n${
        error instanceof Error ? (error.stack ?? "") : ""
      }`;
    }
    if (statusElement !== null) {
      statusElement.setAttribute("data-state", "errored");
      statusElement.textContent = "errored";
    }
  });

export { obligationContractIdentity };
