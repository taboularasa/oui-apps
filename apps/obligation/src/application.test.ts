import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApplication } from "@oui/react";
import applicationIr from "./generated/compiler/application.ir.json?raw";
import contract from "./generated/ontobff/contract.json";
import { obligationCapabilities } from "./application";

const session = {
  actor: { id: "actor-inspector", displayName: "Inspector" },
  tenant: null,
  capabilities: ["asset.read", "obligation.read", "exception.read"],
  locale: "en-US",
  timeZone: "UTC",
};

describe("compiled obligation application IR", () => {
  it("is the exact IR the BFF plan was compiled from", () => {
    const path = fileURLToPath(
      new URL("./generated/compiler/application.ir.json", import.meta.url),
    );
    const digest =
      "sha256:" + createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(digest).toBe(contract.irDigest);
  });

  it("mounts under the real OUI runtime validator", () => {
    const bootstrap = createApplication({
      ir: applicationIr,
      runtime: {
        capabilities: obligationCapabilities,
        services: {
          clock: { now: () => new Date() },
          diagnostics: { report: () => undefined },
        },
        session,
      },
    });
    if (bootstrap.status !== "ready") {
      console.log(JSON.stringify(bootstrap, null, 1).slice(0, 4000));
    }
    expect(bootstrap.status).toBe("ready");
  });
});
