import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile:
          process.env.PROFESSIONAL_SERVICES_PLAYWRIGHT_RESULT ??
          "../../conformance/results/professional-services-playwright.json",
      },
    ],
  ],
  use: {
    baseURL:
      process.env.PROFESSIONAL_SERVICES_UAT_ORIGIN ?? "http://127.0.0.1:18093",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
