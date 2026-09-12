import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/*.test.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile:
          process.env.OUI_UAT_PLAYWRIGHT_RESULT ??
          "../../conformance/results/playwright-live-uat.json",
      },
    ],
  ],
  use: {
    baseURL: process.env.OUI_UAT_BASE_URL ?? "http://127.0.0.1:18083/uat/",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
