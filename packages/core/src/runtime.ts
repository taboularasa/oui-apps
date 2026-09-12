import type { RequiredCapability } from "./ir/types";
import type { IrDiagnostic } from "./ir/validation";

export interface Actor {
  readonly id: string;
  readonly displayName: string;
}

export interface TenantContext {
  readonly id: string;
  readonly displayName?: string;
}

export interface SessionContext {
  readonly actor: Actor | null;
  readonly tenant: TenantContext | null;
  readonly capabilities: readonly string[];
  readonly locale: string;
  readonly timeZone: string;
}

export interface RuntimeClock {
  now(): Date;
}

export interface DiagnosticSink {
  report(diagnostic: IrDiagnostic): void;
}

export interface RuntimeServices {
  readonly clock: RuntimeClock;
  readonly diagnostics: DiagnosticSink;
}

export interface RuntimeCapability {
  readonly id: string;
  readonly version: string;
}

export type CapabilityRequirement = RequiredCapability;

export interface RuntimeConfiguration {
  readonly capabilities: readonly RuntimeCapability[];
  readonly services: RuntimeServices;
  readonly session: SessionContext;
}

export interface OUIRuntime {
  readonly services: RuntimeServices;
  readonly session: SessionContext;
  capabilityVersion(id: string): string | undefined;
  hasCapability(id: string, minimumVersion?: string): boolean;
}

const semanticVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

export function createRuntime(configuration: RuntimeConfiguration): OUIRuntime {
  const capabilities = new Map<string, string>();

  for (const capability of configuration.capabilities) {
    if (capabilities.has(capability.id)) {
      throw new Error(`Runtime capability ${capability.id} is duplicated.`);
    }

    if (parseSemanticVersion(capability.version) === undefined) {
      throw new Error(
        `Runtime capability ${capability.id} has invalid version ${capability.version}.`,
      );
    }

    capabilities.set(capability.id, capability.version);
  }

  const session = deepFreeze(structuredClone(configuration.session));
  const services = Object.freeze({ ...configuration.services });

  return Object.freeze({
    services,
    session,
    capabilityVersion(id: string): string | undefined {
      return capabilities.get(id);
    },
    hasCapability(id: string, minimumVersion?: string): boolean {
      const actual = capabilities.get(id);

      if (actual === undefined) {
        return false;
      }

      return minimumVersion === undefined
        ? true
        : compareSemanticVersions(actual, minimumVersion) >= 0;
    },
  });
}

export function validateRuntimeCapabilities(
  requirements: readonly CapabilityRequirement[],
  runtime: OUIRuntime,
): readonly IrDiagnostic[] {
  const diagnostics: IrDiagnostic[] = [];

  requirements.forEach((requirement, index) => {
    const path = `/requiredCapabilities/${String(index)}`;
    const actualVersion = runtime.capabilityVersion(requirement.id);

    if (actualVersion === undefined) {
      diagnostics.push(
        Object.freeze({
          code: "IR_REQUIRED_CAPABILITY_UNKNOWN",
          status: "unsupported",
          severity: "fatal",
          dimension: "capability",
          message: `Required capability ${requirement.id} is unavailable.`,
          irPath: `${path}/id`,
          expected: requirement.id,
        }),
      );
      return;
    }

    if (
      compareSemanticVersions(actualVersion, requirement.minimumVersion) < 0
    ) {
      diagnostics.push(
        Object.freeze({
          code: "IR_REQUIRED_CAPABILITY_VERSION",
          status: "unsupported",
          severity: "fatal",
          dimension: "capability",
          message: `Capability ${requirement.id} does not meet its minimum version.`,
          irPath: `${path}/minimumVersion`,
          expected: `>= ${requirement.minimumVersion}`,
          actual: actualVersion,
        }),
      );
    }
  });

  return Object.freeze(diagnostics);
}

function compareSemanticVersions(left: string, right: string): number {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);

  if (leftVersion === undefined || rightVersion === undefined) {
    return -1;
  }

  for (let index = 0; index < leftVersion.length; index += 1) {
    const difference = (leftVersion[index] ?? 0) - (rightVersion[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseSemanticVersion(
  value: string,
): readonly [number, number, number] | undefined {
  const match = semanticVersionPattern.exec(value);

  if (match === null) {
    return undefined;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value;
  }

  seen.add(value);

  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }

  return Object.freeze(value);
}
