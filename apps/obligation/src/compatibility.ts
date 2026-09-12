import type { OperationContractIdentity } from "@oui/data";
import compatibilityEnvelope from "./generated/ontobff/compatibility.json";
import obligationContract from "./generated/ontobff/contract.json";
import outputManifest from "./generated/ontobff/manifest.json";

export const ouiRuntimeVersion = "1.0.0";

export interface ObligationContractIdentity extends OperationContractIdentity {
  readonly outputManifestIdentity: string;
  readonly generatedGoDigest: string;
  readonly connectDigest: string;
  readonly generatorIdentity: string;
  readonly bffRuntimeIdentity: string;
  readonly requiredRuntimeRange: string;
  readonly requiredCapabilities: readonly string[];
}

export interface BffCompatibility {
  readonly applicationId: string;
  readonly irVersion: string;
  readonly irDigest: string;
  readonly bffPlanDigest: string;
  readonly descriptorDigest: string;
  readonly generatedGoDigest: string;
  readonly connectDigest: string;
  readonly generatorVersion: string;
  readonly runtimeVersion: string;
  readonly manifestDigest: string;
  readonly contractDigest: string;
  readonly capabilities: readonly string[];
}

/**
 * The identity OUI was built against, read from the imported generated
 * artifacts rather than from anything the server tells us at runtime.
 */
export const obligationContractIdentity: ObligationContractIdentity =
  deepFreeze({
    applicationId: obligationContract.applicationId,
    irVersion: obligationContract.irVersion,
    irDigest: obligationContract.irDigest,
    bffPlanDigest: obligationContract.planDigest,
    descriptorDigest: obligationContract.descriptorDigest,
    contractDigest: compatibilityEnvelope.contractDigest,
    runtimeVersion: ouiRuntimeVersion,
    outputManifestIdentity: compatibilityEnvelope.manifestDigest,
    generatedGoDigest: outputManifest.generatedGoDigest,
    connectDigest: outputManifest.connectDigest,
    generatorIdentity: outputManifest.generatorId,
    bffRuntimeIdentity: outputManifest.runtimeId,
    requiredRuntimeRange: obligationContract.requiredRuntime,
    requiredCapabilities: outputManifest.capabilities,
  });

export class CompatibilityAdmissionError extends Error {
  readonly diagnostics: readonly string[];

  constructor(diagnostics: readonly string[]) {
    super(
      `OntoBFF compatibility admission failed:\n${diagnostics
        .map((diagnostic) => `- ${diagnostic}`)
        .join("\n")}`,
    );
    this.name = "CompatibilityAdmissionError";
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

/**
 * Compare every artifact identity the served BFF publishes with the identities
 * bound into this bundle, and fail closed before any operational request is
 * issued. A stale frontend must not execute against a different semantic,
 * generated, or transport contract.
 */
export function admitObligationCompatibility(
  actual: BffCompatibility,
): ObligationContractIdentity {
  const expected = obligationContractIdentity;
  const diagnostics: string[] = [];

  const compare = (label: string, left: string, right: string): void => {
    if (left !== right) {
      diagnostics.push(`${label} mismatch: served ${left}, bundled ${right}`);
    }
  };

  compare("application", actual.applicationId, expected.applicationId);
  compare("IR version", actual.irVersion, expected.irVersion);
  compare("IR digest", actual.irDigest, expected.irDigest);
  compare("BFF plan digest", actual.bffPlanDigest, expected.bffPlanDigest);
  compare(
    "descriptor digest",
    actual.descriptorDigest,
    expected.descriptorDigest,
  );
  compare("contract digest", actual.contractDigest, expected.contractDigest);
  compare(
    "output manifest identity",
    actual.manifestDigest,
    expected.outputManifestIdentity,
  );
  compare(
    "generated Go digest",
    actual.generatedGoDigest,
    expected.generatedGoDigest,
  );
  compare(
    "Connect binding digest",
    actual.connectDigest,
    expected.connectDigest,
  );
  compare(
    "generator identity",
    actual.generatorVersion,
    expected.generatorIdentity,
  );
  compare(
    "BFF runtime identity",
    actual.runtimeVersion,
    expected.bffRuntimeIdentity,
  );

  for (const capability of expected.requiredCapabilities) {
    if (!actual.capabilities.includes(capability)) {
      diagnostics.push(
        `served BFF does not offer required capability ${capability}`,
      );
    }
  }

  if (diagnostics.length > 0) {
    throw new CompatibilityAdmissionError(diagnostics);
  }
  return expected;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
