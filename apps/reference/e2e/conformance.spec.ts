import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { setPermission } from "./permission-database";

const axeSource = axe.source;
const baseURL = requireEnvironment("OUI_UAT_BASE_URL");
const origin = new URL(baseURL).origin;
const databasePath = requireEnvironment("OUI_UAT_DATABASE");
const token = requireEnvironment("OUI_UAT_TEST_TOKEN");
const referenceContractIdentity = readContractIdentity();
let server: ChildProcess | undefined;

test.beforeAll(async () => {
  server = startServer(true);
  await waitUntilReady();
});

test.afterAll(async () => {
  await stopServer();
});

test("drives the released Go BFF through the complete OUI browser path", async ({
  page,
}) => {
  await expect.poll(readinessStatus).toBe(200);
  await page.goto(baseURL);
  await expect(page.getByText("UAT Actor")).toBeVisible();

  await page.getByRole("link", { name: "Items" }).click();
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Items" })).toBeVisible();
  await page.getByRole("link", { name: "UAT Item" }).click();
  await expect(page.getByRole("heading", { name: "UAT Item" })).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit item" })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("UAT Item");

  const firstRequest = page.waitForRequest((request) =>
    request.url().endsWith("/UpdateItem"),
  );
  const firstResponse = page.waitForResponse((response) =>
    response.url().endsWith("/UpdateItem"),
  );
  await page.getByLabel("Title").fill("UAT Item Updated by OUI");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Form status")).toContainText("Changes saved");
  const updateRequest = await firstRequest;
  const updateResponse = await firstResponse;
  expect(updateResponse.status()).toBe(200);
  const updateHeaders = await updateRequest.allHeaders();
  const updateBody = updateRequest.postData() ?? "";
  const updateResult = await updateResponse.json();
  expect(updateHeaders).toEqual(
    expect.objectContaining({
      "accept-language": "en-US",
      "x-oui-time-zone": "UTC",
      "x-oui-application": referenceContractIdentity.applicationId,
      "x-oui-ir-version": referenceContractIdentity.irVersion,
      "x-oui-ir-digest": referenceContractIdentity.irDigest,
      "x-oui-bff-plan-digest": referenceContractIdentity.bffPlanDigest,
      "x-oui-descriptor-digest": referenceContractIdentity.descriptorDigest,
      "x-oui-contract-digest": referenceContractIdentity.contractDigest,
      "x-oui-runtime-version": "1.0.0",
    }),
  );
  expect(updateHeaders.authorization).toMatch(/^Bearer .+/u);
  expect(updateHeaders["idempotency-key"]).toBeTruthy();
  expect(updateHeaders["x-correlation-id"]).toBeTruthy();
  expect(updateHeaders.traceparent).toMatch(
    /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u,
  );
  expect(updateHeaders.tracestate).toBe("oui=reference");
  expect(updateHeaders["connect-timeout-ms"]).toBe("10000");
  expect(updateHeaders["if-match"]).toBe("v1");

  const replay = await browserConnect(
    page,
    "UpdateItem",
    updateBody,
    updateHeaders,
  );
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(updateResult);

  const idempotencyConflict = await browserConnect(
    page,
    "UpdateItem",
    mutateUpdateBody(updateBody, {
      expectedVersion: "v1",
      title: "Changed input with reused identity",
    }),
    updateHeaders,
  );
  expect(idempotencyConflict.status).toBe(409);
  expect(JSON.stringify(idempotencyConflict.body)).toContain(
    "ConflictErrorDetail",
  );
  expect(JSON.stringify(idempotencyConflict.body)).toContain(
    "idempotency key was used for different input",
  );

  const invalidBody = mutateUpdateBody(updateBody, {
    expectedVersion: "v2",
    title: "",
  });
  const invalid = await browserConnect(page, "UpdateItem", invalidBody, {
    ...updateHeaders,
    "idempotency-key": crypto.randomUUID(),
    "if-match": "v2",
  });
  expect(invalid.status).toBe(400);
  expect(JSON.stringify(invalid.body)).toContain("ValidationErrorDetail");
  expect(JSON.stringify(invalid.body)).toContain("changes.title");

  const concurrentBody = mutateUpdateBody(updateBody, {
    expectedVersion: "v2",
    title: "Concurrent authoritative update",
  });
  const concurrent = await browserConnect(page, "UpdateItem", concurrentBody, {
    ...updateHeaders,
    "idempotency-key": crypto.randomUUID(),
    "if-match": "v2",
  });
  expect(concurrent.status).toBe(200);

  await page.getByLabel("Title").fill("Stale OUI draft");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Form errors")).toContainText(
    "resource version is stale",
  );

  await page.goto(baseURL);
  await page.getByRole("link", { name: "Items" }).click();
  await page
    .getByRole("link", { name: "Concurrent authoritative update" })
    .click();
  await page.getByRole("link", { name: "Edit" }).click();
  setPermission(databasePath, "items.update", false);
  try {
    await page.getByLabel("Title").fill("Unauthorized OUI update");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByLabel("Form errors")).toContainText(
      "actor lacks the required capability",
    );
  } finally {
    setPermission(databasePath, "items.update", true);
  }

  await expect
    .poll(() => auditCorrelation(updateHeaders["x-correlation-id"] ?? ""))
    .toBe(updateHeaders["x-correlation-id"]);

  await page.goto(baseURL);
  await page.getByRole("link", { name: "Review proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Decide proposal" }),
  ).toBeVisible();
  const evidence = page.getByRole("checkbox", {
    name: "I reviewed the required evidence",
  });
  await evidence.focus();
  await page.keyboard.press("Space");
  await expect(evidence).toBeChecked();
  await page.getByRole("button", { name: "Choose Approve" }).click();
  await page.getByRole("button", { name: "Continue with Approve" }).click();
  await page.getByRole("button", { name: "Confirm Approve" }).click();
  await expect(
    page.getByRole("region", { name: "Decision outcome" }),
  ).toBeVisible();
  await expect(page.getByLabel("Operation stream status")).toContainText(
    "succeeded",
  );
  await expect(
    page.getByRole("region", { name: "Operation progress" }),
  ).toContainText("Decision applied");
  await page.getByRole("button", { name: "Resume from last event" }).click();
  await expect(page.getByLabel("Operation stream status")).toContainText(
    "succeeded",
  );
  await expectNoAccessibilityViolations(page);

  const mismatch = await browserConnect(page, "GetSession", "{}", {
    ...operationHeaders(),
    "x-oui-contract-digest": `sha256:${"0".repeat(64)}`,
  });
  expect(mismatch.status).toBe(400);
  expect(JSON.stringify(mismatch.body)).toContain("failed_precondition");

  await stopServer();
  await expect.poll(readinessStatus).not.toBe(200);
  const restoreCompatibleIdentity = installIncompatibleIdentity();
  try {
    server = startServer(false);
    await waitUntilReady();
    await page.goto(baseURL);
    const refusal = page.locator('[data-oui-live-admission="failed"]');
    await expect(refusal).toContainText("application mismatch");
    await expect(page.getByRole("link", { name: "Items" })).toHaveCount(0);
  } finally {
    await stopServer();
    restoreCompatibleIdentity();
  }
  server = startServer(false);
  await waitUntilReady();
  await page.goto(baseURL);
  await page.getByRole("link", { name: "Items" }).click();
  await expect(
    page.getByRole("link", { name: "Concurrent authoritative update" }),
  ).toBeVisible();
  await expect.poll(readinessStatus).toBe(200);
});

function startServer(seed: boolean): ChildProcess {
  const log = openSync(requireEnvironment("OUI_UAT_SERVER_LOG"), "a");
  const child = spawn(requireEnvironment("OUI_UAT_BFF_BINARY"), [], {
    cwd: requireEnvironment("OUI_UAT_SOURCE_ROOT"),
    env: {
      ...process.env,
      LISTEN_ADDR: new URL(origin).host,
      DATABASE_URL: databasePath,
      RESUME_TOKEN_KEY: requireEnvironment("OUI_UAT_RESUME_KEY"),
      ONTOBFF_MANIFEST: `${requireEnvironment("OUI_UAT_SOURCE_ROOT")}/apps/reference/gen/manifest.json`,
      ONTOBFF_COMPATIBILITY: `${requireEnvironment("OUI_UAT_SOURCE_ROOT")}/apps/reference/gen/compatibility.json`,
      REFERENCE_BROWSER_UAT_DIR: requireEnvironment("OUI_UAT_SITE_ROOT"),
      ...(seed ? { REFERENCE_TEST_TOKEN: token } : {}),
    },
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  if (child.pid === undefined)
    throw new Error("The reference BFF did not start.");
  writeFileSync(requireEnvironment("OUI_UAT_PID_FILE"), String(child.pid));
  return child;
}

function installIncompatibleIdentity(): () => void {
  const generatedRoot = `${requireEnvironment("OUI_UAT_SOURCE_ROOT")}/apps/reference/gen`;
  const paths = {
    compatibility: `${generatedRoot}/compatibility.json`,
    contract: `${generatedRoot}/contract.json`,
    manifest: `${generatedRoot}/manifest.json`,
  } as const;
  const original = Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [name, readFileSync(path)]),
  ) as Record<keyof typeof paths, Buffer>;
  const manifest = JSON.parse(original.manifest.toString("utf8")) as {
    applicationId: string;
  };
  manifest.applicationId = "application:incompatible-uat";
  const manifestBytes = JSON.stringify(manifest);

  const contract = JSON.parse(original.contract.toString("utf8")) as {
    applicationId: string;
    ontoBffManifestDigest: string;
  };
  contract.applicationId = manifest.applicationId;
  contract.ontoBffManifestDigest = digest(manifestBytes);
  const contractBytes = JSON.stringify(contract);

  const compatibility = JSON.parse(original.compatibility.toString("utf8")) as {
    contractDigest: string;
    manifestDigest: string;
  };
  compatibility.manifestDigest = digest(manifestBytes);
  compatibility.contractDigest = digest(contractBytes);

  writeFileSync(paths.manifest, manifestBytes);
  writeFileSync(paths.contract, contractBytes);
  writeFileSync(paths.compatibility, JSON.stringify(compatibility));

  return () => {
    for (const [name, path] of Object.entries(paths)) {
      writeFileSync(path, original[name as keyof typeof original]);
    }
  };
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function stopServer(): Promise<void> {
  if (server === undefined || server.exitCode !== null) {
    server = undefined;
    return;
  }
  const stopped = new Promise<void>((resolve) => {
    server?.once("exit", () => resolve());
  });
  server.kill("SIGTERM");
  await stopped;
  server = undefined;
}

async function waitUntilReady(): Promise<void> {
  await expect.poll(readinessStatus, { timeout: 15_000 }).toBe(200);
}

async function readinessStatus(): Promise<number> {
  try {
    return (await fetch(`${origin}/readyz`, { cache: "no-store" })).status;
  } catch {
    return 0;
  }
}

async function browserConnect(
  page: Page,
  method: string,
  body: string,
  headers: Readonly<Record<string, string>>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  return page.evaluate(
    async ({ requestBody, requestHeaders, requestMethod, requestOrigin }) => {
      const response = await fetch(
        `${requestOrigin}/oui.reference.v1.ReferenceFrontendService/${requestMethod}`,
        {
          method: "POST",
          headers: requestHeaders,
          body: requestBody,
        },
      );
      return { status: response.status, body: await response.json() };
    },
    {
      requestBody: body,
      requestHeaders: headers,
      requestMethod: method,
      requestOrigin: origin,
    },
  );
}

function operationHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-oui-application": referenceContractIdentity.applicationId,
    "x-oui-ir-version": referenceContractIdentity.irVersion,
    "x-oui-ir-digest": referenceContractIdentity.irDigest,
    "x-oui-bff-plan-digest": referenceContractIdentity.bffPlanDigest,
    "x-oui-descriptor-digest": referenceContractIdentity.descriptorDigest,
    "x-oui-contract-digest": referenceContractIdentity.contractDigest,
    "x-oui-runtime-version": referenceContractIdentity.runtimeVersion,
    "x-correlation-id": `uat-${crypto.randomUUID()}`,
  };
}

function readContractIdentity() {
  const root = requireEnvironment("OUI_UAT_SOURCE_ROOT");
  const contract = JSON.parse(
    readFileSync(`${root}/apps/reference/gen/contract.json`, "utf8"),
  ) as {
    applicationId: string;
    irVersion: string;
    irDigest: string;
    planDigest: string;
    descriptorDigest: string;
  };
  const compatibility = JSON.parse(
    readFileSync(`${root}/apps/reference/gen/compatibility.json`, "utf8"),
  ) as { contractDigest: string };
  return {
    applicationId: contract.applicationId,
    irVersion: contract.irVersion,
    irDigest: contract.irDigest,
    bffPlanDigest: contract.planDigest,
    descriptorDigest: contract.descriptorDigest,
    contractDigest: compatibility.contractDigest,
    runtimeVersion: "1.0.0",
  };
}

function mutateUpdateBody(
  body: string,
  change: { readonly expectedVersion: string; readonly title: string },
): string {
  const input = JSON.parse(body) as {
    expectedVersion: string;
    changes: { title: string };
  };
  input.expectedVersion = change.expectedVersion;
  input.changes.title = change.title;
  return JSON.stringify(input);
}

function auditCorrelation(correlationId: string): string | undefined {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database
      .prepare("SELECT correlation_id FROM audit_sink WHERE correlation_id = ?")
      .get(correlationId) as { readonly correlation_id?: string } | undefined;
    return row?.correlation_id;
  } finally {
    database.close();
  }
}

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const axeRuntime = (
      window as typeof window & {
        axe: {
          run(
            root: Document,
          ): Promise<{ violations: readonly { id: string }[] }>;
        };
      }
    ).axe;
    return (await axeRuntime.run(document)).violations.map(({ id }) => id);
  });
  expect(violations).toEqual([]);
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required by the real OntoBFF UAT.`);
  }
  return value;
}
