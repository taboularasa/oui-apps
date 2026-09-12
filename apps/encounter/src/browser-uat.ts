/**
 * Encounter workbench browser UAT.
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
  admitEncounterCompatibility,
  CompatibilityAdmissionError,
  encounterContractIdentity,
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
      "Encounter workbench — a domain-neutral application compiled from",
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
  const identity = admitEncounterCompatibility(served);
  record("compatibility admission accepts the served contract", true);

  // 2. A deliberate mismatch must fail closed, using OUI's own admission.
  try {
    admitEncounterCompatibility({
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
      correlationId: `oui-encounter-${crypto.randomUUID()}`,
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
    sessionResult.actor?.id === "actor-dispatcher",
    `actor = ${sessionResult.actor?.id ?? "none"}`,
  );
  record(
    "session discloses the compiled transition capability",
    sessionResult.capabilities.includes("encounter.transition"),
    `capabilities = ${sessionResult.capabilities.join(",")}`,
  );

  // 4. Collection, tenant scoping, pagination.
  const page = await client.listEncounters(
    { pageSize: 2 },
    { headers: await headers() },
  );
  record(
    "collection paginates through the generated client",
    page.encounters.length === 2 && page.nextPageToken !== "",
    `${page.encounters.length} rows, token ${page.nextPageToken}`,
  );
  const all = await client.listEncounters({}, { headers: await headers() });
  record(
    "another tenant's encounter never reaches the browser",
    all.encounters.every((encounter) => encounter.id !== "encounter-5"),
  );

  // 5. Detail with the customer relationship.
  const detail = await client.getEncounter(
    { encounterId: "encounter-1" },
    { headers: await headers() },
  );
  record(
    "detail resolves the sched:hasCustomer relationship",
    detail.customer?.name === "Ridgeline Property Group",
    `customer = ${detail.customer?.name ?? "none"}`,
  );

  // 6. Compiled validation, surfaced as typed field violations.
  await expectConnectError(
    "compiled one_of rule returns a typed field violation",
    "invalid_argument",
    async () =>
      client.transitionEncounter(
        {
          encounterId: "encounter-1",
          expectedVersion: "1",
          changes: { status: "dispatched" },
          updateMask: ["status"],
        },
        {
          headers: await headers({ idempotencyKey: "browser-invalid-status" }),
        },
      ),
    (error) => {
      const violation = error
        .validationDetail()
        ?.violations.find(
          (candidate) => candidate.fieldPath === "changes.status",
        );
      return violation?.constraintId === "target_status_required"
        ? undefined
        : "missing typed violation for changes.status";
    },
  );

  await expectConnectError(
    "compiled length rule returns a typed field violation",
    "invalid_argument",
    async () =>
      client.transitionEncounter(
        {
          encounterId: "encounter-1",
          expectedVersion: "1",
          changes: { status: "in_progress", summary: "x".repeat(201) },
          updateMask: ["status", "summary"],
        },
        { headers: await headers({ idempotencyKey: "browser-long-summary" }) },
      ),
    (error) => {
      const violation = error
        .validationDetail()
        ?.violations.find(
          (candidate) => candidate.fieldPath === "changes.summary",
        );
      return violation?.constraintId === "summary_length"
        ? undefined
        : "missing typed violation for changes.summary";
    },
  );

  // 7. The browser is never an enforcement boundary.
  await expectConnectError(
    "an action the browser would hide is still refused server-side",
    "permission_denied",
    async () => {
      const viewerHeaders = await headers({ idempotencyKey: "browser-viewer" });
      viewerHeaders.set("authorization", `Bearer ${token}-viewer`);
      return client.transitionEncounter(
        {
          encounterId: "encounter-1",
          expectedVersion: "1",
          changes: { status: "in_progress" },
          updateMask: ["status"],
        },
        { headers: viewerHeaders },
      );
    },
  );

  // 8. Declared business invariant.
  await expectConnectError(
    "declared invariant blocks a terminal encounter",
    "failed_precondition",
    async () =>
      client.transitionEncounter(
        {
          encounterId: "encounter-4",
          expectedVersion: "1",
          changes: { status: "in_progress" },
          updateMask: ["status"],
        },
        { headers: await headers({ idempotencyKey: "browser-terminal" }) },
      ),
  );

  // 9. The authoritative command path.
  const advanced = await client.transitionEncounter(
    {
      encounterId: "encounter-1",
      expectedVersion: "1",
      changes: { status: "in_progress", summary: "Technician on site" },
      updateMask: ["status", "summary"],
    },
    {
      headers: await headers({
        idempotencyKey: "browser-advance",
        expectedVersion: "1",
      }),
    },
  );
  record(
    "transition advances state and bumps the version",
    advanced.encounter?.status === "in_progress" &&
      advanced.encounter?.version === "2",
    `status ${advanced.encounter?.status}, version ${advanced.encounter?.version}`,
  );
  record("transition returns an audit identity", advanced.auditId !== "");

  // 10. Exact replay of a consequential command.
  const replayed = await client.transitionEncounter(
    {
      encounterId: "encounter-1",
      expectedVersion: "1",
      changes: { status: "in_progress", summary: "Technician on site" },
      updateMask: ["status", "summary"],
    },
    {
      headers: await headers({
        idempotencyKey: "browser-advance",
        expectedVersion: "1",
      }),
    },
  );
  record(
    "exact replay returns the original authoritative outcome",
    replayed.auditId === advanced.auditId &&
      replayed.encounter?.version === advanced.encounter?.version,
  );

  // 11. Idempotency conflict and optimistic concurrency.
  await expectConnectError(
    "idempotency key reuse with changed input conflicts",
    "already_exists",
    async () =>
      client.transitionEncounter(
        {
          encounterId: "encounter-1",
          expectedVersion: "2",
          changes: { status: "completed" },
          updateMask: ["status"],
        },
        { headers: await headers({ idempotencyKey: "browser-advance" }) },
      ),
  );

  await expectConnectError(
    "stale expected version cannot overwrite current state",
    "aborted",
    async () =>
      client.transitionEncounter(
        {
          encounterId: "encounter-1",
          expectedVersion: "1",
          changes: { status: "completed" },
          updateMask: ["status"],
        },
        {
          headers: await headers({
            idempotencyKey: "browser-stale",
            expectedVersion: "1",
          }),
        },
      ),
  );

  // 12. Durable across a fresh request.
  const reloaded = await client.getEncounter(
    { encounterId: "encounter-1" },
    { headers: await headers() },
  );
  record(
    "the advanced state is durable across requests",
    reloaded.encounter?.status === "in_progress",
    `status = ${reloaded.encounter?.status}`,
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

export { encounterContractIdentity };
