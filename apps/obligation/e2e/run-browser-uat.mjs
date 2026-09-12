// Drives the obligation browser UAT in Chromium against a live generated Go
// service. The bundle is served from that service's own origin, so the browser
// exercises the real transport with no CORS policy invented for the host.
import { chromium } from "playwright";

// The assertions below advance real state and consume idempotency keys, so
// the service under test must be backed by a database no other UAT has
// mutated. Run this against its own deployment, not a shared one.
const origin = process.env.OBLIGATION_UAT_ORIGIN ?? "http://127.0.0.1:18090";
const token = process.env.OBLIGATION_UAT_TOKEN;
if (!token) {
  console.error("OBLIGATION_UAT_TOKEN is required");
  process.exit(2);
}

// A managed edge can answer with its own 404 while an instance is still
// rolling. Wait for a settled deployment before navigating, so a transient
// routing gap is not reported as a failed assertion.
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
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

// The application is served at /uat/; this harness is its second entry point.
await page.goto(`${origin}/uat/uat.html?token=${encodeURIComponent(token)}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(
  () =>
    document.querySelector("#uat-status")?.getAttribute("data-state") !==
    "running",
  undefined,
  { timeout: 60_000 },
);

const state = await page.getAttribute("#uat-status", "data-state");
const log = await page.textContent("#uat-log");
await browser.close();

console.log(log ?? "(no log)");
if (consoleErrors.length > 0) {
  console.log("\nbrowser errors:");
  for (const error of consoleErrors) console.log(`  ${error}`);
}
console.log(`\nbrowser UAT state: ${state}`);
process.exit(state === "passed" ? 0 : 1);
