import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TestConnectClient } from "@oui/data";
import { createApplication } from "@oui/react";
import compilerImport from "./generated/compiler/import-manifest.json";
import compilerManifest from "./generated/compiler/compiler-output-manifest.json";
import {
  applicationId,
  applicationIr,
  applicationIrDigest,
  compilationId,
} from "./generated/compiler/oui-application.generated";
import { createProfessionalServicesApplicationComposition } from "./application";

const capabilities = Object.freeze([
  { id: "interaction.decision", version: "1.0.0" },
  { id: "interaction.detail", version: "1.0.0" },
  { id: "transport.connect.unary", version: "1.0.0" },
  { id: "presentation.theme.semantic-tokens", version: "1.0.0" },
]);

describe("imported professional-services compiler bundle", () => {
  it("is byte-bound to the producer merge and loads through the real OUI validator", () => {
    expect(compilerImport).toMatchObject({
      sourceRepository: "taboularasa/smb-ontology-platform",
      sourceCommit: "4818131ac4d24cc089d4feb353c2a65c8adbc5f3",
      compiler: "smb-ontology-platform.semantic-compiler/v1",
      applicationId: "application:professional-services-conflict-decision",
      irDigest:
        "sha256:1fc86cb7e3809b6e00c836b28ab80108558987451679c900dcdd0f843e4a6eac",
      specificationDigest:
        "sha256:40fd745bbada560e203a78f76d28428b3f006984711225a67ff3b685122add16",
    });
    expect(applicationId).toBe(compilerImport.applicationId);
    expect(applicationIrDigest).toBe(compilerImport.irDigest);
    expect(compilationId).toBe(compilerManifest.compilationId);

    for (const [path, expected] of Object.entries(compilerImport.files)) {
      const absolute = fileURLToPath(
        new URL(`./generated/compiler/${path}`, import.meta.url),
      );
      expect(digest(readFileSync(absolute)), path).toBe(expected);
    }

    const bootstrap = createApplication({
      ir: JSON.stringify(applicationIr),
      runtime: {
        capabilities,
        services: {
          clock: { now: () => new Date("2026-08-20T00:00:00Z") },
          diagnostics: { report: () => undefined },
        },
        session: {
          actor: { id: "actor-reviewer", displayName: "Conflict Reviewer" },
          tenant: null,
          capabilities: ["conflict_check.read", "conflict_check.decide"],
          locale: "en-US",
          timeZone: "UTC",
        },
      },
    });
    expect(bootstrap.status).toBe("ready");
  });

  it("mounts the declared detail and decision routes through application-local bindings", () => {
    const composition = createProfessionalServicesApplicationComposition({
      client: new TestConnectClient(
        "oui.professional_services.v1.ProfessionalServicesFrontendService",
        {},
      ),
      identity: {
        applicationId: "application:professional-services-conflict-decision",
        irVersion: "1.0.0",
        irDigest:
          "sha256:1fc86cb7e3809b6e00c836b28ab80108558987451679c900dcdd0f843e4a6eac",
        bffPlanDigest:
          "sha256:538c38279bd2eef60ef4707a6da6c677f898db5a886e0a40cb5f6bf000aca827",
        descriptorDigest:
          "sha256:0212fe0eb0527899f0213bcdf907bf66faaf322baa84fd1bd596982561d6073d",
        contractDigest:
          "sha256:8fb5500c939441fdb5676b49ce1d1c239f65ec534b4074eb8ae78e26ca294a30",
        runtimeVersion: "1.0.0",
      },
      metadata: { getMetadata: () => ({ accessToken: "test-only" }) },
      session: {
        actor: { id: "actor-reviewer", displayName: "Conflict Reviewer" },
        tenant: null,
        capabilities: ["conflict_check.read", "conflict_check.decide"],
        locale: "en-US",
        timeZone: "UTC",
      },
    });

    expect(composition.applicationBootstrap.status).toBe("ready");
    expect(
      Object.values(composition.applicationBootstrap.application.routes).map(
        ({ path }) => path,
      ),
    ).toEqual([
      "/conflict-checks/{conflictCheckId}/decision",
      "/conflict-checks/{conflictCheckId}",
    ]);
    expect(
      ["interaction.detail", "interaction.decision"].map(
        (capability) =>
          composition.extensionCatalog.lookup(
            "interaction_pattern",
            capability,
            "/test",
          ).ok,
      ),
    ).toEqual([true, true]);
  });
});

function digest(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
