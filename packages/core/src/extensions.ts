import type { IrDiagnostic } from "./ir/validation";
import type { RuntimeCapability } from "./runtime";

export type ExtensionCategory =
  | "command_adapter"
  | "field_control"
  | "interaction_pattern"
  | "primitive_adapter"
  | "renderer"
  | "theme";

export type ExtensionLifecycle = "application" | "interaction" | "singleton";

export type ExtensionOrigin = "core" | "extension";

export type ExtensionRegistryState = "registering" | "sealed";

export interface DefaultExtensionImplementations {
  readonly command_adapter: unknown;
  readonly field_control: unknown;
  readonly interaction_pattern: unknown;
  readonly primitive_adapter: unknown;
  readonly renderer: unknown;
  readonly theme: unknown;
}

export interface ExtensionIrRange {
  readonly major: number;
  readonly minimumMinor: number;
  readonly maximumMinor: number;
}

export interface ExtensionContract {
  readonly id: string;
  readonly version: string;
}

export interface ExtensionRegistration<
  Category extends ExtensionCategory = ExtensionCategory,
  Implementation = unknown,
> {
  readonly id: string;
  readonly category: Category;
  readonly capability: RuntimeCapability;
  readonly contract: ExtensionContract;
  readonly supportedIr: ExtensionIrRange;
  readonly lifecycle: ExtensionLifecycle;
  readonly origin: ExtensionOrigin;
  readonly implementation: Implementation;
}

export interface ExtensionOverrideAuthorization {
  readonly capabilityId: string;
  readonly replaces: string;
  readonly replacement: string;
  readonly reason: string;
}

export interface ExtensionRegistryOptions {
  readonly overrides?: readonly ExtensionOverrideAuthorization[];
}

export type ExtensionRegistrationErrorCode =
  | "EXTENSION_CAPABILITY_CONFLICT"
  | "EXTENSION_OVERRIDE_NOT_AUTHORIZED"
  | "EXTENSION_REGISTRATION_DUPLICATE_ID"
  | "EXTENSION_REGISTRY_SEALED";

export class ExtensionRegistrationError extends Error {
  readonly code: ExtensionRegistrationErrorCode;
  readonly registrationId: string;

  constructor(
    code: ExtensionRegistrationErrorCode,
    registrationId: string,
    message: string,
  ) {
    super(message);
    this.name = "ExtensionRegistrationError";
    this.code = code;
    this.registrationId = registrationId;
  }
}

export interface ExtensionLookupSuccess<Implementation> {
  readonly ok: true;
  readonly registration: ExtensionRegistration<
    ExtensionCategory,
    Implementation
  >;
}

export interface ExtensionLookupFailure {
  readonly ok: false;
  readonly diagnostics: readonly IrDiagnostic[];
}

export type ExtensionLookupResult<Implementation> =
  ExtensionLookupFailure | ExtensionLookupSuccess<Implementation>;

export interface ExtensionCatalog<
  Implementations extends DefaultExtensionImplementations =
    DefaultExtensionImplementations,
> {
  readonly irVersion: string;
  lookup<Category extends ExtensionCategory>(
    category: Category,
    capabilityId: string,
    irPath?: string,
  ): ExtensionLookupResult<Implementations[Category]>;
  runtimeCapabilities(): readonly RuntimeCapability[];
}

export interface ExtensionRegistry<
  Implementations extends DefaultExtensionImplementations =
    DefaultExtensionImplementations,
> {
  readonly state: ExtensionRegistryState;
  register<Category extends ExtensionCategory>(
    registration: ExtensionRegistration<Category, Implementations[Category]>,
  ): void;
  seal(irVersion: string): ExtensionCatalog<Implementations>;
}

interface MutableRegistry<
  Implementations extends DefaultExtensionImplementations,
> {
  state: ExtensionRegistryState;
  readonly activeByCapability: Map<
    string,
    ExtensionRegistration<ExtensionCategory, Implementations[ExtensionCategory]>
  >;
  readonly byId: Map<
    string,
    ExtensionRegistration<ExtensionCategory, Implementations[ExtensionCategory]>
  >;
}

const semanticVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

export function createExtensionRegistry<
  Implementations extends DefaultExtensionImplementations =
    DefaultExtensionImplementations,
>(options: ExtensionRegistryOptions = {}): ExtensionRegistry<Implementations> {
  const mutable: MutableRegistry<Implementations> = {
    state: "registering",
    activeByCapability: new Map(),
    byId: new Map(),
  };
  const overrides = Object.freeze([...(options.overrides ?? [])]);

  return {
    get state() {
      return mutable.state;
    },
    register<Category extends ExtensionCategory>(
      registration: ExtensionRegistration<Category, Implementations[Category]>,
    ): void {
      if (mutable.state !== "registering") {
        throw new ExtensionRegistrationError(
          "EXTENSION_REGISTRY_SEALED",
          registration.id,
          "Extensions cannot be registered after the registry is sealed.",
        );
      }

      if (mutable.byId.has(registration.id)) {
        throw new ExtensionRegistrationError(
          "EXTENSION_REGISTRATION_DUPLICATE_ID",
          registration.id,
          `Extension registration ${registration.id} is duplicated.`,
        );
      }

      validateRegistration(registration);
      const existing = mutable.activeByCapability.get(
        registration.capability.id,
      );

      if (existing !== undefined) {
        const authorization = overrides.find(
          (override) =>
            override.capabilityId === registration.capability.id &&
            override.replaces === existing.id &&
            override.replacement === registration.id &&
            override.reason.trim().length > 0,
        );

        if (authorization === undefined) {
          throw new ExtensionRegistrationError(
            existing.origin === "core"
              ? "EXTENSION_OVERRIDE_NOT_AUTHORIZED"
              : "EXTENSION_CAPABILITY_CONFLICT",
            registration.id,
            `Capability ${registration.capability.id} is already registered by ${existing.id}.`,
          );
        }
      }

      const stored = Object.freeze({
        ...registration,
        capability: Object.freeze({ ...registration.capability }),
        contract: Object.freeze({ ...registration.contract }),
        supportedIr: Object.freeze({ ...registration.supportedIr }),
      });
      mutable.byId.set(
        stored.id,
        stored as ExtensionRegistration<
          ExtensionCategory,
          Implementations[ExtensionCategory]
        >,
      );
      mutable.activeByCapability.set(
        stored.capability.id,
        stored as ExtensionRegistration<
          ExtensionCategory,
          Implementations[ExtensionCategory]
        >,
      );
    },
    seal(irVersion: string): ExtensionCatalog<Implementations> {
      if (mutable.state === "sealed") {
        throw new ExtensionRegistrationError(
          "EXTENSION_REGISTRY_SEALED",
          "registry",
          "The extension registry is already sealed.",
        );
      }

      if (parseSemanticVersion(irVersion) === undefined) {
        throw new Error(
          `Cannot seal extensions for invalid IR version ${irVersion}.`,
        );
      }

      mutable.state = "sealed";
      return createCatalog(irVersion, new Map(mutable.activeByCapability));
    },
  };
}

function createCatalog<Implementations extends DefaultExtensionImplementations>(
  irVersion: string,
  registrations: ReadonlyMap<
    string,
    ExtensionRegistration<ExtensionCategory, Implementations[ExtensionCategory]>
  >,
): ExtensionCatalog<Implementations> {
  return Object.freeze({
    irVersion,
    lookup<Category extends ExtensionCategory>(
      category: Category,
      capabilityId: string,
      irPath = "/requiredCapabilities",
    ): ExtensionLookupResult<Implementations[Category]> {
      const registration = registrations.get(capabilityId);

      if (registration === undefined || registration.category !== category) {
        return lookupFailure(
          "OUI_EXTENSION_CAPABILITY_MISSING",
          `No ${category} registration provides ${capabilityId}.`,
          irPath,
          capabilityId,
        );
      }

      if (!supportsIr(registration.supportedIr, irVersion)) {
        return lookupFailure(
          "OUI_EXTENSION_IR_RANGE_UNSUPPORTED",
          `Extension ${registration.id} does not support IR ${irVersion}.`,
          irPath,
          capabilityId,
        );
      }

      return Object.freeze({
        ok: true,
        registration: registration as ExtensionRegistration<
          ExtensionCategory,
          Implementations[Category]
        >,
      });
    },
    runtimeCapabilities(): readonly RuntimeCapability[] {
      return Object.freeze(
        [...registrations.values()]
          .filter((registration) =>
            supportsIr(registration.supportedIr, irVersion),
          )
          .map((registration) => Object.freeze({ ...registration.capability }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      );
    },
  });
}

function lookupFailure(
  code:
    "OUI_EXTENSION_CAPABILITY_MISSING" | "OUI_EXTENSION_IR_RANGE_UNSUPPORTED",
  message: string,
  irPath: string,
  capabilityId: string,
): ExtensionLookupFailure {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([
      Object.freeze({
        code,
        status: "unsupported",
        severity: "fatal",
        dimension: "capability",
        message,
        irPath,
        expected: capabilityId,
      }),
    ]),
  });
}

function supportsIr(range: ExtensionIrRange, irVersion: string): boolean {
  const version = parseSemanticVersion(irVersion);

  return (
    version !== undefined &&
    version[0] === range.major &&
    version[1] >= range.minimumMinor &&
    version[1] <= range.maximumMinor
  );
}

function validateRegistration(
  registration: ExtensionRegistration<ExtensionCategory, unknown>,
): void {
  if (
    registration.id.length === 0 ||
    registration.capability.id.length === 0 ||
    registration.contract.id.length === 0
  ) {
    throw new Error("Extension identifiers must be non-empty.");
  }

  if (
    parseSemanticVersion(registration.capability.version) === undefined ||
    parseSemanticVersion(registration.contract.version) === undefined
  ) {
    throw new Error(
      `Extension ${registration.id} must use semantic capability and contract versions.`,
    );
  }

  if (
    registration.supportedIr.major < 0 ||
    registration.supportedIr.minimumMinor < 0 ||
    registration.supportedIr.maximumMinor <
      registration.supportedIr.minimumMinor
  ) {
    throw new Error(`Extension ${registration.id} has an invalid IR range.`);
  }
}

function parseSemanticVersion(
  value: string,
): readonly [number, number, number] | undefined {
  const match = semanticVersionPattern.exec(value);

  return match === null
    ? undefined
    : [Number(match[1]), Number(match[2]), Number(match[3])];
}
