import type { OperationContractIdentity } from "@oui/data";
import compatibilityPairs from "../generated/compatibility-pairs.json";
import compatibilityEnvelope from "../generated/ontobff/compatibility.json";
import referenceContract from "../generated/ontobff/contract.json";
import outputManifest from "../generated/ontobff/manifest.json";

export const ouiRuntimeVersion = "1.0.0";
export const ouiClientRelease = "oui.reference/1.0.0";

export interface ReferenceContractIdentity extends OperationContractIdentity {
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

export interface NegotiatedReferenceContractIdentity extends ReferenceContractIdentity {
  readonly clientRelease: string;
  readonly serverRelease: string;
  readonly versionPairId: string;
}

export const referenceContractIdentity: ReferenceContractIdentity = deepFreeze({
  applicationId: referenceContract.applicationId,
  irVersion: referenceContract.irVersion,
  irDigest: referenceContract.irDigest,
  bffPlanDigest: referenceContract.planDigest,
  descriptorDigest: referenceContract.descriptorDigest,
  contractDigest: compatibilityEnvelope.contractDigest,
  runtimeVersion: ouiRuntimeVersion,
  outputManifestIdentity: compatibilityEnvelope.manifestDigest,
  generatedGoDigest: outputManifest.generatedGoDigest,
  connectDigest: outputManifest.connectDigest,
  generatorIdentity: outputManifest.generatorId,
  bffRuntimeIdentity: outputManifest.runtimeId,
  requiredRuntimeRange: referenceContract.requiredRuntime,
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

export function admitReferenceCompatibility(
  actual: BffCompatibility,
): ReferenceContractIdentity {
  const expected = referenceContractIdentity;
  const diagnostics: string[] = [];
  compare(
    diagnostics,
    "application",
    actual.applicationId,
    expected.applicationId,
  );
  compare(diagnostics, "IR version", actual.irVersion, expected.irVersion);
  compare(diagnostics, "IR digest", actual.irDigest, expected.irDigest);
  compare(
    diagnostics,
    "BFF plan digest",
    actual.bffPlanDigest,
    expected.bffPlanDigest,
  );
  compare(
    diagnostics,
    "descriptor digest",
    actual.descriptorDigest,
    expected.descriptorDigest,
  );
  compare(
    diagnostics,
    "contract digest",
    actual.contractDigest,
    expected.contractDigest,
  );
  compare(
    diagnostics,
    "output manifest identity",
    actual.manifestDigest,
    expected.outputManifestIdentity,
  );
  compare(
    diagnostics,
    "generated Go digest",
    actual.generatedGoDigest,
    expected.generatedGoDigest,
  );
  compare(
    diagnostics,
    "Connect binding digest",
    actual.connectDigest,
    expected.connectDigest,
  );
  compare(
    diagnostics,
    "generator identity",
    actual.generatorVersion,
    expected.generatorIdentity,
  );
  compare(
    diagnostics,
    "OntoBFF runtime identity",
    actual.runtimeVersion,
    expected.bffRuntimeIdentity,
  );
  if (
    !runtimeSatisfies(expected.requiredRuntimeRange, expected.runtimeVersion)
  ) {
    diagnostics.push(
      `OUI runtime ${expected.runtimeVersion} does not satisfy ${expected.requiredRuntimeRange}.`,
    );
  }
  for (const capability of expected.requiredCapabilities) {
    if (!actual.capabilities.includes(capability)) {
      diagnostics.push(`required capability ${capability} is unavailable.`);
    }
  }
  if (diagnostics.length > 0) {
    throw new CompatibilityAdmissionError(diagnostics);
  }
  return expected;
}

export function negotiateReferenceCompatibility(
  actual: BffCompatibility,
  clientRelease: string,
): NegotiatedReferenceContractIdentity {
  const server = compatibilityPairs.servers.find(({ identity }) =>
    sameCompatibilityIdentity(identity, actual),
  );
  const client = compatibilityPairs.clients.find(
    ({ release }) => release === clientRelease,
  );
  const pair = compatibilityPairs.acceptedPairs.find(
    ({ clientRelease: acceptedClient, serverRelease }) =>
      acceptedClient === clientRelease && serverRelease === server?.release,
  );
  const diagnostics: string[] = [];
  if (client === undefined) {
    diagnostics.push(`client release ${clientRelease} is not governed.`);
  }
  if (server === undefined) {
    diagnostics.push(
      "server contract identity is not an exact retained release artifact.",
    );
    const closest = compatibilityPairs.servers
      .map(({ identity }) => serverIdentityDiagnostics(identity, actual))
      .sort((left, right) => left.length - right.length)[0];
    diagnostics.push(...(closest ?? []));
  }
  if (pair === undefined && client !== undefined && server !== undefined) {
    diagnostics.push(
      `client ${clientRelease} and server ${server.release} are not an accepted version pair.`,
    );
  }
  if (client !== undefined && server !== undefined) {
    if (!runtimeSatisfies(server.requiredRuntime, client.runtimeVersion)) {
      diagnostics.push(
        `OUI runtime ${client.runtimeVersion} does not satisfy ${server.requiredRuntime}.`,
      );
    }
    for (const capability of client.requiredCapabilities) {
      if (!actual.capabilities.includes(capability)) {
        diagnostics.push(`required capability ${capability} is unavailable.`);
      }
    }
  }
  if (
    diagnostics.length > 0 ||
    client === undefined ||
    server === undefined ||
    pair === undefined
  ) {
    throw new CompatibilityAdmissionError(diagnostics);
  }
  return deepFreeze({
    applicationId: actual.applicationId,
    irVersion: actual.irVersion,
    irDigest: actual.irDigest,
    bffPlanDigest: actual.bffPlanDigest,
    descriptorDigest: actual.descriptorDigest,
    contractDigest: actual.contractDigest,
    runtimeVersion: client.runtimeVersion,
    outputManifestIdentity: actual.manifestDigest,
    generatedGoDigest: actual.generatedGoDigest,
    connectDigest: actual.connectDigest,
    generatorIdentity: actual.generatorVersion,
    bffRuntimeIdentity: actual.runtimeVersion,
    requiredRuntimeRange: server.requiredRuntime,
    requiredCapabilities: client.requiredCapabilities,
    clientRelease,
    serverRelease: server.release,
    versionPairId: pair.id,
  });
}

function compare(
  diagnostics: string[],
  label: string,
  actual: string,
  expected: string,
) {
  if (actual !== expected) {
    diagnostics.push(
      `${label} mismatch: expected ${expected}, received ${actual}.`,
    );
  }
}

function sameCompatibilityIdentity(
  expected: BffCompatibility,
  actual: BffCompatibility,
): boolean {
  return serverIdentityDiagnostics(expected, actual).length === 0;
}

function serverIdentityDiagnostics(
  expected: BffCompatibility,
  actual: BffCompatibility,
): string[] {
  const diagnostics: string[] = [];
  compare(
    diagnostics,
    "application",
    actual.applicationId,
    expected.applicationId,
  );
  compare(diagnostics, "IR version", actual.irVersion, expected.irVersion);
  compare(diagnostics, "IR digest", actual.irDigest, expected.irDigest);
  compare(
    diagnostics,
    "BFF plan digest",
    actual.bffPlanDigest,
    expected.bffPlanDigest,
  );
  compare(
    diagnostics,
    "descriptor digest",
    actual.descriptorDigest,
    expected.descriptorDigest,
  );
  compare(
    diagnostics,
    "generated Go digest",
    actual.generatedGoDigest,
    expected.generatedGoDigest,
  );
  compare(
    diagnostics,
    "Connect binding digest",
    actual.connectDigest,
    expected.connectDigest,
  );
  compare(
    diagnostics,
    "generator identity",
    actual.generatorVersion,
    expected.generatorVersion,
  );
  compare(
    diagnostics,
    "OntoBFF runtime identity",
    actual.runtimeVersion,
    expected.runtimeVersion,
  );
  compare(
    diagnostics,
    "output manifest identity",
    actual.manifestDigest,
    expected.manifestDigest,
  );
  compare(
    diagnostics,
    "contract digest",
    actual.contractDigest,
    expected.contractDigest,
  );
  return diagnostics;
}

function runtimeSatisfies(range: string, version: string): boolean {
  const parsed = parseVersion(version);
  if (parsed === undefined) {
    return false;
  }
  return range.split(/\s+/u).every((constraint) => {
    const match = /^(>=|>|<=|<|=)?(\d+\.\d+\.\d+)$/u.exec(constraint);
    if (match === null) {
      return false;
    }
    const boundary = parseVersion(match[2] ?? "");
    if (boundary === undefined) {
      return false;
    }
    const comparison = compareVersions(parsed, boundary);
    switch (match[1] ?? "=") {
      case ">=":
        return comparison >= 0;
      case ">":
        return comparison > 0;
      case "<=":
        return comparison <= 0;
      case "<":
        return comparison < 0;
      default:
        return comparison === 0;
    }
  });
}

function parseVersion(
  value: string,
): readonly [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  return match === null
    ? undefined
    : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
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
