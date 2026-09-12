import type { OperationContractIdentity } from "@oui/data";
import compilerImport from "./generated/compiler/import-manifest.json";
import compatibilityEnvelope from "./generated/ontobff/compatibility.json";
import contract from "./generated/ontobff/contract.json";
import ontobffImport from "./generated/ontobff/import-manifest.json";
import outputManifest from "./generated/ontobff/manifest.json";

export interface ProfessionalServicesContractIdentity extends OperationContractIdentity {
  readonly outputManifestIdentity: string;
  readonly generatedGoDigest: string;
  readonly connectDigest: string;
  readonly generatorIdentity: string;
  readonly bffRuntimeIdentity: string;
  readonly requiredRuntimeRange: string;
  readonly requiredCapabilities: readonly string[];
}

export const professionalServicesContractIdentity: ProfessionalServicesContractIdentity =
  deepFreeze({
    applicationId: contract.applicationId,
    irVersion: contract.irVersion,
    irDigest: contract.irDigest,
    bffPlanDigest: contract.planDigest,
    descriptorDigest: contract.descriptorDigest,
    contractDigest: compatibilityEnvelope.contractDigest,
    runtimeVersion: "1.0.0",
    outputManifestIdentity: compatibilityEnvelope.manifestDigest,
    generatedGoDigest: outputManifest.generatedGoDigest,
    connectDigest: outputManifest.connectDigest,
    generatorIdentity: outputManifest.generatorId,
    bffRuntimeIdentity: outputManifest.runtimeId,
    requiredRuntimeRange: contract.requiredRuntime,
    requiredCapabilities: outputManifest.capabilities,
  });

/**
 * This BFF intentionally exposes compatibility per request rather than a
 * discovery RPC. Validate every bundled projection against both import
 * manifests before the first generated Connect request reaches the server.
 */
export function verifyProfessionalServicesArtifacts(): readonly string[] {
  const diagnostics: string[] = [];
  const compare = (label: string, actual: string, expected: string): void => {
    if (actual !== expected) {
      diagnostics.push(`${label} mismatch: ${actual} != ${expected}`);
    }
  };

  compare("application", contract.applicationId, compilerImport.applicationId);
  compare("IR", contract.irDigest, compilerImport.irDigest);
  compare(
    "OntoBFF application",
    contract.applicationId,
    ontobffImport.applicationId,
  );
  compare("OntoBFF IR", contract.irDigest, ontobffImport.irDigest);
  compare("plan", contract.planDigest, ontobffImport.bffPlanDigest);
  compare(
    "descriptor",
    contract.descriptorDigest,
    ontobffImport.descriptorDigest,
  );
  compare(
    "contract",
    compatibilityEnvelope.contractDigest,
    ontobffImport.contractDigest,
  );
  compare(
    "manifest",
    compatibilityEnvelope.manifestDigest,
    ontobffImport.outputManifestIdentity,
  );
  compare("generated manifest IR", outputManifest.irDigest, contract.irDigest);
  compare(
    "generated manifest plan",
    outputManifest.planDigest,
    contract.planDigest,
  );
  compare(
    "generated manifest descriptor",
    outputManifest.descriptorDigest,
    contract.descriptorDigest,
  );
  return Object.freeze(diagnostics);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
