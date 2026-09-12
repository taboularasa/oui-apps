import { describe, expect, it } from "vitest";
import {
  admitBootstrapCompatibility,
  createBootstrapRequestSignal,
  createReferenceSession,
} from "./bootstrap";

describe("live reference bootstrap", () => {
  it("creates independent timeout signals for sequential bootstrap RPCs", () => {
    const compatibilitySignal = createBootstrapRequestSignal();
    const sessionSignal = createBootstrapRequestSignal();

    expect(compatibilitySignal).not.toBe(sessionSignal);
    expect(compatibilitySignal.aborted).toBe(false);
    expect(sessionSignal.aborted).toBe(false);
  });

  it("maps the real GetSession presentation result without granting authority", () => {
    expect(
      createReferenceSession({
        actor: { id: "actor:1", displayName: "Operator" },
        tenant: null,
        permissions: [
          "items.read",
          "items.update",
          "decision.read",
          "decision.decide",
          "operations.read",
        ],
        locale: "en-CA",
        timeZone: "America/Toronto",
      }),
    ).toEqual({
      actor: { id: "actor:1", displayName: "Operator" },
      tenant: null,
      capabilities: [
        "permission:item.read",
        "permission:item.update",
        "permission:proposal.view",
        "permission:proposal.decide",
        "permission:operation.view",
      ],
      locale: "en-CA",
      timeZone: "America/Toronto",
    });
  });

  it("admits the governed patch server for the released browser client", () => {
    const identity = admitBootstrapCompatibility({
      applicationId: "application:reference",
      irVersion: "1.0.1",
      irDigest:
        "sha256:eb94591cfb81900658c2e75c15da02137c243b2ee50fa525789f906e38de8ab6",
      bffPlanDigest:
        "sha256:5025e17731f739458e88df1eb4cb10e02327bbdade26730e1e5652dcc10822ca",
      descriptorDigest:
        "sha256:b6f9c7b0a9ac702f772fb9c594bf3a1d902804c93699573c90e2418891adf7f9",
      generatedGoDigest:
        "sha256:a77e1d5c5e13ec56f22fc274ef974fd2530c110720c1fc4e13ac3538a6c53441",
      connectDigest:
        "sha256:73cfb9f3a5cf63ea338fbbcfc2d4d3b5e49dd541f016a3e948d5bb9feb59ebe1",
      generatorVersion: "ontobff.dev/v1",
      runtimeVersion: "ontobff.runtime/v1",
      manifestDigest:
        "sha256:b4cebd4e8cf54a6b4686386105b8c7f451be05cc27a31a837631e7e32a2c7a07",
      contractDigest:
        "sha256:cc43b63c6054a514002330426f9a6fbeee8b09de794d0e350b91c528070fca79",
      capabilities: [
        "typed.errors",
        "stream.resume",
        "compatibility.per_request",
        "connect.unary",
        "transport.security",
      ],
    });

    expect(identity.clientRelease).toBe("oui.reference/1.0.0");
    expect(identity.serverRelease).toBe("ontobff.reference/1.0.1");
    expect(identity.versionPairId).toBe("reference-old-client-new-server");
  });
});
