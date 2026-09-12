import { expect, test } from "@playwright/test";

const token = requireEnvironment("PROFESSIONAL_SERVICES_UAT_TOKEN");
test.setTimeout(90_000);

test("replaces a rejected stored credential in the mounted application", async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext();
  await context.addInitScript(
    ({ credentialKey, rejectedCredential }) => {
      window.sessionStorage.setItem(credentialKey, rejectedCredential);
    },
    {
      credentialKey: "professional-services-conflict-review.credential",
      rejectedCredential: "rejected-test-credential",
    },
  );
  const ui = await context.newPage();

  await ui.goto(`${baseURL}/uat/conflict-checks/conflict-check-1/decision`);
  await expect(
    ui.getByText("The decision context could not be loaded."),
  ).toBeVisible();
  await expect(ui.getByRole("banner")).toHaveCount(1);
  await ui.getByRole("button", { name: "Use a different credential" }).click();
  await ui.getByLabel("Access credential").fill(token);
  await ui.getByRole("button", { name: "Sign in" }).click();

  await expect(
    ui.getByRole("heading", { name: "Decide conflict check" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      ui.evaluate(() =>
        window.sessionStorage.getItem(
          "professional-services-conflict-review.credential",
        ),
      ),
    )
    .toBe(token);
  await context.close();
});

test("mounts the decision UI and executes every generated Connect path", async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext();
  const ui = await context.newPage();
  const pageErrors: string[] = [];
  ui.on("pageerror", (error) => pageErrors.push(String(error)));

  await ui.goto(
    `${baseURL}/uat/conflict-checks/conflict-check-1/decision?token=${encodeURIComponent(token)}`,
  );
  await expect(
    ui.getByRole("heading", { name: "Decide conflict check" }),
  ).toBeVisible();
  await expect(ui.getByText("Ownership search", { exact: true })).toBeVisible();
  await expect(ui.getByText("Reviewer note", { exact: true })).toBeVisible();
  await expect(ui.getByLabel("Subject status")).toContainText("pending");
  expect(ui.url()).not.toContain("token=");

  const reviewed = ui.getByRole("checkbox", {
    name: "I reviewed the required evidence",
  });
  await reviewed.focus();
  await ui.keyboard.press("Space");
  await expect(reviewed).toBeChecked();
  await ui.getByRole("button", { name: "Choose Accept with waiver" }).click();
  const continueWithWaiver = ui.getByRole("button", {
    name: "Continue with Accept with waiver",
  });
  await expect(continueWithWaiver).toBeDisabled();
  await ui.getByLabel("Decision reason").fill("The client granted a waiver.");
  await expect(continueWithWaiver).toBeEnabled();

  await ui.getByRole("button", { name: "Choose Clear" }).click();
  await ui.getByRole("button", { name: "Continue with Clear" }).click();
  await expect(
    ui.getByRole("alertdialog", { name: "Confirm Clear" }),
  ).toBeVisible();

  const scenarios = await context.newPage();
  const correlationHeaders: string[] = [];
  scenarios.on("response", async (response) => {
    if (response.url().endsWith("/DecideConflictCheck")) {
      const correlation = (await response.allHeaders())["x-correlation-id"];
      if (correlation !== undefined) {
        correlationHeaders.push(
          ...correlation.split(",").map((identity) => identity.trim()),
        );
      }
    }
  });
  scenarios.on("pageerror", (error) => pageErrors.push(String(error)));
  await scenarios.goto(
    `${baseURL}/uat/uat.html?token=${encodeURIComponent(token)}`,
  );
  await scenarios.waitForFunction(
    () =>
      document.querySelector("#uat-status")?.getAttribute("data-state") !==
      "running",
  );
  const scenarioState = await scenarios
    .locator("#uat-status")
    .getAttribute("data-state");
  const scenarioLog = (await scenarios.locator("#uat-log").textContent()) ?? "";
  expect(scenarioState, scenarioLog).toBe("passed");
  expect(scenarioLog).toContain("10 passed, 0 failed");
  expect(correlationHeaders).toContain("browser-correlation-approval");

  await ui.getByRole("button", { name: "Confirm Clear" }).click();
  await expect(
    ui.getByText(/changed or was decided by someone else/u),
  ).toBeVisible();
  await ui.getByRole("button", { name: "Refresh decision context" }).click();
  await expect(ui.getByLabel("Subject status")).toContainText("cleared");
  await expect(
    ui.getByText("This decision requires status to be pending.", {
      exact: true,
    }),
  ).toBeVisible();

  await ui.goto(`${baseURL}/uat/conflict-checks/conflict-check-1`);
  await expect(
    ui.getByRole("heading", { name: "clear", exact: true }),
  ).toBeVisible();
  await expect(
    ui.getByText("Ownership overlap requires engagement review."),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  await context.close();
});

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}
