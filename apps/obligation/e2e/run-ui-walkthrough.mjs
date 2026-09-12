// Walks the rendered obligation workbench in Chromium against a live generated
// Go service: the collection renders from the compiled IR, a row navigates to
// its detail route, and the detail renders the declared regions.
//
// This asserts the UI a person actually sees. The enforcement semantics are
// covered separately by run-browser-uat.mjs.
import { chromium } from "playwright";

const origin = process.env.OBLIGATION_UAT_ORIGIN ?? "http://127.0.0.1:18090";
const token = process.env.OBLIGATION_UAT_TOKEN;
if (!token) {
  console.error("OBLIGATION_UAT_TOKEN is required");
  process.exit(2);
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

async function waitForSettledDeployment() {
  let streak = 0;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${origin}/healthz`, {
        signal: AbortSignal.timeout(20_000),
      });
      streak = response.ok ? streak + 1 : 0;
    } catch {
      streak = 0;
    }
    if (streak >= 8) return;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`${origin} never settled into a healthy deployment`);
}

await waitForSettledDeployment();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

await page.goto(`${origin}/uat/?token=${encodeURIComponent(token)}`, {
  waitUntil: "domcontentloaded",
});

// The shell lands on the first declared navigation entry.
await page.waitForURL(/\/uat\/obligations/u, { timeout: 60_000 });
record("shell lands on the declared navigation route", true);

const table = page.locator("table");
await table.waitFor({ state: "visible", timeout: 60_000 });

const headers = (await page.locator("thead th").allInnerTexts()).map((text) =>
  text.trim(),
);
record(
  "collection renders the IR's visible fields as columns",
  ["Summary", "Status", "Scheduled start", "Customer name"].every((column) =>
    headers.includes(column),
  ),
  `headers = ${headers.join(" | ")}`,
);

const rows = page.locator("tbody tr");
const rowCount = await rows.count();
record(
  "collection renders the tenant's obligations",
  rowCount === 4,
  `${rowCount} rows`,
);

const firstRowText = await rows.first().innerText();
record(
  "rows render real values rather than placeholders",
  !firstRowText.includes("Not provided") &&
    /20\d\d-/u.test(firstRowText) &&
    /Ridgeline|Harbour/u.test(
      await rows.allInnerTexts().then((all) => all.join(" ")),
    ),
  firstRowText.replaceAll("\n", " | ").slice(0, 160),
);

const scheduled = page
  .locator("tbody tr", { hasText: "Quarterly inspection" })
  .locator("a")
  .first();
const detailHref = await scheduled.getAttribute("href");
record(
  "each row links to its declared detail route",
  detailHref !== null && /\/uat\/obligations\/obligation-\d/u.test(detailHref),
  `href = ${detailHref}`,
);

await scheduled.click();
await page.waitForURL(/\/uat\/obligations\/obligation-1/u, { timeout: 60_000 });
await page.waitForTimeout(1_500);
const detailText = await page.locator("main, body").first().innerText();
record(
  "detail route renders the selected obligation",
  detailText.includes("Quarterly inspection"),
  detailText.replaceAll("\n", " | ").slice(0, 200),
);
record(
  "detail renders the declared summary region fields",
  detailText.includes("scheduled") && detailText.includes("2026-08-17"),
  detailText.replaceAll("\n", " | ").slice(0, 200),
);

await page.screenshot({ path: "e2e/obligation-detail.png", fullPage: true });

// The credential must not linger in the address bar, or it travels in every
// shared link.
record(
  "the credential is removed from the address bar",
  !page.url().includes("token="),
  page.url(),
);

// A reload proves the deep link is served by the origin, not only routed
// client-side, and that the session survives it.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2_500);
const reloaded = await page.locator("main, body").first().innerText();
record(
  "a detail deep link survives a reload",
  page.url().includes("/uat/obligations/obligation-1"),
  page.url(),
);
record(
  "the session survives a reload rather than prompting again",
  reloaded.includes("Quarterly inspection") &&
    !reloaded.includes("Demo credential"),
  reloaded.replaceAll("\n", " | ").slice(0, 160),
);

// --- the customer relationship is followable -------------------------------
const customerLink = page.locator("dd a").first();
if ((await customerLink.count()) > 0) {
  const customerHref = await customerLink.getAttribute("href");
  const customerLabel = (await customerLink.innerText()).trim();
  record(
    "the customer relationship renders a name and follows its route",
    customerLabel === "Ridgeline Property Group" &&
      /\/uat\/customers\/customer-1/u.test(customerHref ?? ""),
    `${customerLabel} -> ${customerHref}`,
  );
  await customerLink.click();
  await page.waitForURL(/\/uat\/customers\/customer-1/u, { timeout: 60_000 });
  await page.waitForTimeout(1_500);
  record(
    "the customer detail route renders",
    (await page.locator("body").innerText()).includes(
      "Ridgeline Property Group",
    ),
  );
} else {
  record(
    "the customer relationship renders a name and follows its route",
    false,
    "no relationship link rendered",
  );
}

// --- the edit route reaches the compiled command ---------------------------
await page.goto(`${origin}/uat/obligations/obligation-1/edit`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2_500);
const editText = await page.locator("body").innerText();
record(
  "the edit route renders a form for the declared fields",
  editText.includes("Status") && editText.includes("Summary"),
  editText.replaceAll("\n", " | ").slice(0, 200),
);
const submit = page
  .getByRole("button", { name: /save|submit|advance|apply/iu })
  .first();
record(
  "the form offers a submit action",
  (await submit.count()) > 0,
  editText.replaceAll("\n", " | ").slice(0, 200),
);

// --- editing actually advances the obligation ------------------------------
await page.goto(`${origin}/uat/obligations/obligation-2/edit`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2_500);
await page.locator("select").last().selectOption({ label: "In Progress" });
await page.locator("input[type=text]").last().fill("Advanced from the UI");
await page.getByRole("button", { name: /save/iu }).first().click();
await page.waitForTimeout(3_500);
record(
  "saving lands on the route the form declares",
  /\/uat\/obligations\/obligation-2$/u.test(page.url()),
  page.url(),
);
const saved = await page.locator("body").innerText();
record(
  "the saved change is the authoritative value the server returned",
  saved.includes("Advanced from the UI") && saved.includes("in_progress"),
  saved.replaceAll("\n", " | ").slice(0, 200),
);

// --- the create route renders ---------------------------------------------
await page.goto(`${origin}/uat/obligations/new`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2_500);
const createText = await page.locator("body").innerText();
record(
  "the create route renders a form for a new obligation",
  createText.includes("Summary") && createText.includes("Customer"),
  createText.replaceAll("\n", " | ").slice(0, 200),
);

// --- the customers collection renders --------------------------------------
await page.goto(`${origin}/uat/customers`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2_500);
const customersText = await page.locator("body").innerText();
record(
  "the customers collection renders its own resource",
  customersText.includes("Ridgeline Property Group") &&
    customersText.includes("Harbour Facilities Ltd"),
  customersText.replaceAll("\n", " | ").slice(0, 200),
);

record(
  "the application raised no page error",
  pageErrors.length === 0,
  pageErrors.join(" ; ").slice(0, 300),
);

await browser.close();

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(
    `${result.ok ? "PASS" : "FAIL"}  ${result.name}` +
      (result.ok || !result.detail ? "" : `\n      ${result.detail}`),
  );
}
console.log(
  `\n${results.length - failed.length} passed, ${failed.length} failed`,
);
process.exit(failed.length === 0 ? 0 : 1);
