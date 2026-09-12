import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import compilerImport from "./generated/compiler/import-manifest.json";
import ontobffImport from "./generated/ontobff/import-manifest.json";
import {
  professionalServicesContractIdentity,
  verifyProfessionalServicesArtifacts,
} from "./compatibility";

describe("imported professional-services OntoBFF bundle", () => {
  it("binds the generated client and transport evidence to the merged runtime", () => {
    expect(ontobffImport).toMatchObject({
      sourceRepository: "taboularasa/ontobff",
      sourceCommit: "3e4863853f2d6749becf570702f78232b65f8074",
      applicationId: compilerImport.applicationId,
      irDigest: compilerImport.irDigest,
      descriptorDigest:
        "sha256:0212fe0eb0527899f0213bcdf907bf66faaf322baa84fd1bd596982561d6073d",
      outputManifestIdentity:
        "sha256:6bfb1fa0a5a5d74baa5a69f6fb1aa7c04766c256d5b11f8968b4c5b0fed898aa",
    });

    for (const [path, expected] of Object.entries(ontobffImport.files)) {
      const absolute = fileURLToPath(
        new URL(`./generated/ontobff/${path}`, import.meta.url),
      );
      expect(digest(readFileSync(absolute)), path).toBe(expected);
    }

    expect(verifyProfessionalServicesArtifacts()).toEqual([]);
    expect(professionalServicesContractIdentity).toMatchObject({
      applicationId: compilerImport.applicationId,
      irDigest: compilerImport.irDigest,
      bffPlanDigest:
        "sha256:538c38279bd2eef60ef4707a6da6c677f898db5a886e0a40cb5f6bf000aca827",
      descriptorDigest: ontobffImport.descriptorDigest,
      contractDigest:
        "sha256:8fb5500c939441fdb5676b49ce1d1c239f65ec534b4074eb8ae78e26ca294a30",
      generatedGoDigest:
        "sha256:efdda122ea61ee4038d52190100437bdad8b124818df1a3a16bbbf65f6c76628",
      connectDigest:
        "sha256:c73747704b230f40928d3467e6eb520131bbee0391ec86dd0cfa97cd76ad9442",
    });
  });
});

function digest(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
