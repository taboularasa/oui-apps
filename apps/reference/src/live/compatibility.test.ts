import { describe, expect, it } from "vitest";
import {
  CompatibilityAdmissionError,
  admitReferenceCompatibility,
  negotiateReferenceCompatibility,
  referenceContractIdentity,
} from "./compatibility";

const compatible = {
  applicationId: "application:reference",
  irVersion: "1.0.0",
  irDigest:
    "sha256:fbf4d2513ed30f8d0c84c7cf2697a59fd0b109895afaba5b8c439f7896302439",
  bffPlanDigest:
    "sha256:a620e2a45f7b079e94185a6df18e17aade360766d89e5f0cefabdcb65c00b78e",
  descriptorDigest:
    "sha256:b6f9c7b0a9ac702f772fb9c594bf3a1d902804c93699573c90e2418891adf7f9",
  generatedGoDigest:
    "sha256:2595baa36d84de3096aa3dfdeb59304d7d90e04ff9d1940cebf234eedf5e8ca2",
  connectDigest:
    "sha256:73cfb9f3a5cf63ea338fbbcfc2d4d3b5e49dd541f016a3e948d5bb9feb59ebe1",
  generatorVersion: "ontobff.dev/v1",
  runtimeVersion: "ontobff.runtime/v1",
  manifestDigest:
    "sha256:0737e45f7f6c42146bd7150a21efe9812fe9ac094635eb85a013f3b6ee15a6ef",
  contractDigest:
    "sha256:50bb7f68017fdb00d1e30b57884fc9c6ed4765f05fbe9bb49190a24e20b238ab",
  capabilities: [
    "typed.errors",
    "stream.resume",
    "compatibility.per_request",
    "connect.unary",
    "transport.security",
  ],
} as const;

describe("OntoBFF compatibility admission", () => {
  it("admits the exact released identity envelope before routing", () => {
    expect(admitReferenceCompatibility(compatible)).toEqual(
      referenceContractIdentity,
    );
  });

  it("reports every mismatched identity and missing capability", () => {
    let thrown: unknown;
    try {
      admitReferenceCompatibility({
        ...compatible,
        applicationId: "application:other",
        descriptorDigest: "sha256:other",
        capabilities: ["connect.unary"],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CompatibilityAdmissionError);
    expect((thrown as CompatibilityAdmissionError).diagnostics).toEqual(
      expect.arrayContaining([
        expect.stringContaining("application"),
        expect.stringContaining("descriptor"),
        expect.stringContaining("stream.resume"),
      ]),
    );
  });

  it("negotiates an accepted old client onto the exact regenerated patch server", () => {
    const identity = negotiateReferenceCompatibility(
      {
        ...compatible,
        irVersion: "1.0.1",
        irDigest:
          "sha256:eb94591cfb81900658c2e75c15da02137c243b2ee50fa525789f906e38de8ab6",
        bffPlanDigest:
          "sha256:5025e17731f739458e88df1eb4cb10e02327bbdade26730e1e5652dcc10822ca",
        generatedGoDigest:
          "sha256:a77e1d5c5e13ec56f22fc274ef974fd2530c110720c1fc4e13ac3538a6c53441",
        manifestDigest:
          "sha256:b4cebd4e8cf54a6b4686386105b8c7f451be05cc27a31a837631e7e32a2c7a07",
        contractDigest:
          "sha256:cc43b63c6054a514002330426f9a6fbeee8b09de794d0e350b91c528070fca79",
      },
      "oui.reference/1.0.0",
    );

    expect(identity.versionPairId).toBe("reference-old-client-new-server");
    expect(identity.irVersion).toBe("1.0.1");
    expect(identity.contractDigest).toBe(
      "sha256:cc43b63c6054a514002330426f9a6fbeee8b09de794d0e350b91c528070fca79",
    );
    expect(identity.runtimeVersion).toBe("1.0.0");
  });

  it("names exact identity mismatches for an unrecognized server artifact", () => {
    let thrown: unknown;
    try {
      negotiateReferenceCompatibility(
        { ...compatible, applicationId: "application:substituted" },
        "oui.reference/1.0.0",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CompatibilityAdmissionError);
    expect((thrown as CompatibilityAdmissionError).diagnostics).toEqual(
      expect.arrayContaining([expect.stringContaining("application mismatch")]),
    );
  });
});
