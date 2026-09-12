import { describe, expect, it } from "vitest";
import {
  ExtensionRegistrationError,
  createExtensionRegistry,
  type DefaultExtensionImplementations,
  type ExtensionCategory,
  type ExtensionRegistration,
} from "./extensions";
import { createRuntime, validateRuntimeCapabilities } from "./runtime";

interface TestPattern {
  create(): string;
}

interface TestImplementations extends DefaultExtensionImplementations {
  readonly interaction_pattern: TestPattern;
}

describe("extension registry", () => {
  it("defines the complete extension category vocabulary", () => {
    expect(extensionCategories).toEqual([
      "command_adapter",
      "field_control",
      "interaction_pattern",
      "primitive_adapter",
      "renderer",
      "theme",
    ]);
  });

  it("registers a test-only interaction extension and seals an immutable catalog", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    const registration = patternRegistration();

    expect(registry.state).toBe("registering");
    registry.register(registration);
    const catalog = registry.seal("1.0.0");

    expect(registry.state).toBe("sealed");
    const lookup = catalog.lookup(
      "interaction_pattern",
      "interaction.test-only",
    );

    expect(lookup.ok).toBe(true);

    if (!lookup.ok) {
      throw new Error("Expected the test extension to resolve.");
    }

    expect(lookup.registration.implementation.create()).toBe("test-only");
    expect(lookup.registration.lifecycle).toBe("application");
    expect(lookup.registration.supportedIr).toEqual({
      major: 1,
      minimumMinor: 0,
      maximumMinor: 1,
    });
  });

  it("exports active capabilities for pre-render runtime validation", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    registry.register(patternRegistration());
    const catalog = registry.seal("1.0.0");
    const runtime = createRuntime({
      capabilities: catalog.runtimeCapabilities(),
      services: {
        clock: { now: () => new Date("2026-08-13T00:00:00Z") },
        diagnostics: { report: () => undefined },
      },
      session: {
        actor: null,
        tenant: null,
        capabilities: [],
        locale: "en-US",
        timeZone: "UTC",
      },
    });

    expect(
      validateRuntimeCapabilities(
        [
          {
            id: "interaction.test-only",
            minimumVersion: "1.0.0",
          },
        ],
        runtime,
      ),
    ).toEqual([]);
  });

  it("rejects duplicate registration identifiers deterministically", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    registry.register(patternRegistration());

    expect(() =>
      registry.register(
        patternRegistration({
          capability: {
            id: "interaction.another",
            version: "1.0.0",
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "EXTENSION_REGISTRATION_DUPLICATE_ID",
        registrationId: "extension:test-only",
      }),
    );
  });

  it("rejects conflicting capabilities without an override authorization", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    registry.register(patternRegistration());

    expect(() =>
      registry.register(
        patternRegistration({
          id: "extension:conflict",
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "EXTENSION_CAPABILITY_CONFLICT",
        registrationId: "extension:conflict",
      }),
    );
  });

  it("does not replace core behavior without an explicit override policy", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    registry.register(
      patternRegistration({
        id: "core:test-only",
        origin: "core",
      }),
    );

    expect(() =>
      registry.register(
        patternRegistration({
          id: "extension:replacement",
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "EXTENSION_OVERRIDE_NOT_AUTHORIZED",
        registrationId: "extension:replacement",
      }),
    );
  });

  it("applies an exactly authorized override", () => {
    const registry = createExtensionRegistry<TestImplementations>({
      overrides: [
        {
          capabilityId: "interaction.test-only",
          replaces: "core:test-only",
          replacement: "extension:replacement",
          reason: "Conformance-certified replacement for this application.",
        },
      ],
    });
    registry.register(
      patternRegistration({
        id: "core:test-only",
        origin: "core",
      }),
    );
    registry.register(
      patternRegistration({
        id: "extension:replacement",
        implementation: {
          create: () => "replacement",
        },
      }),
    );

    const lookup = registry
      .seal("1.0.0")
      .lookup("interaction_pattern", "interaction.test-only");

    expect(lookup.ok).toBe(true);

    if (lookup.ok) {
      expect(lookup.registration.id).toBe("extension:replacement");
      expect(lookup.registration.implementation.create()).toBe("replacement");
    }
  });

  it("returns conformance diagnostics for missing and incompatible lookups", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    registry.register(patternRegistration());
    const catalog = registry.seal("1.2.0");
    const incompatible = catalog.lookup(
      "interaction_pattern",
      "interaction.test-only",
      "/interactions/interaction:test",
    );
    const missing = catalog.lookup(
      "renderer",
      "renderer:missing",
      "/interactions/interaction:test/presentation",
    );

    expect(incompatible).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "OUI_EXTENSION_IR_RANGE_UNSUPPORTED",
          irPath: "/interactions/interaction:test",
        },
      ],
    });
    expect(missing).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "OUI_EXTENSION_CAPABILITY_MISSING",
          irPath: "/interactions/interaction:test/presentation",
        },
      ],
    });
  });

  it("rejects registration after sealing", () => {
    const registry = createExtensionRegistry<TestImplementations>();
    registry.seal("1.0.0");

    expect(() => registry.register(patternRegistration())).toThrow(
      ExtensionRegistrationError,
    );
    expect(() => registry.register(patternRegistration())).toThrowError(
      expect.objectContaining({
        code: "EXTENSION_REGISTRY_SEALED",
      }),
    );
  });
});

function patternRegistration(
  overrides: Partial<
    ExtensionRegistration<"interaction_pattern", TestPattern>
  > = {},
): ExtensionRegistration<"interaction_pattern", TestPattern> {
  return {
    id: "extension:test-only",
    category: "interaction_pattern",
    capability: {
      id: "interaction.test-only",
      version: "1.0.0",
    },
    contract: {
      id: "oui.interaction-pattern",
      version: "1.0.0",
    },
    supportedIr: {
      major: 1,
      minimumMinor: 0,
      maximumMinor: 1,
    },
    lifecycle: "application",
    origin: "extension",
    implementation: {
      create: () => "test-only",
    },
    ...overrides,
  };
}

const extensionCategories: readonly ExtensionCategory[] = [
  "command_adapter",
  "field_control",
  "interaction_pattern",
  "primitive_adapter",
  "renderer",
  "theme",
];
