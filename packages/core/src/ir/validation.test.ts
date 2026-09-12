import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ApplicationDefinition } from "./types";
import {
  ApplicationIrValidationError,
  assertApplicationIr,
  parseApplicationIr,
} from "./validation";

interface FixtureDiagnostic {
  readonly code: string;
  readonly irPath: string;
}

interface InvalidFixture {
  readonly id: string;
  readonly patch: string;
  readonly diagnostics: readonly FixtureDiagnostic[];
}

interface FixtureManifest {
  readonly invalid: readonly InvalidFixture[];
}

interface JsonPatchOperation {
  readonly op: "replace";
  readonly path: string;
  readonly value: unknown;
}

const fixtureDirectory = fileURLToPath(
  new URL("../../../../fixtures/reference/", import.meta.url),
);
const validSource = readFixture("application.ir.json");
const validObject = JSON.parse(validSource) as Record<string, unknown>;
const manifest = JSON.parse(readFixture("manifest.json")) as FixtureManifest;

describe("parseApplicationIr", () => {
  it("parses the valid fixture into an immutable typed definition", () => {
    const result = parseApplicationIr(validSource);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected the reference fixture to be valid.");
    }

    const application: ApplicationDefinition = result.application;

    expect(application.id).toBe("application:reference");
    expect(application.interactions["interaction:item-collection"]?.kind).toBe(
      "collection",
    );
    expect(Object.isFrozen(application)).toBe(true);
    expect(Object.isFrozen(application.routes)).toBe(true);
    expect(
      Object.isFrozen(
        application.resources["resource:item"]?.fields["field:item.title"]
          ?.validation,
      ),
    ).toBe(true);
  });

  for (const fixture of manifest.invalid) {
    it(`reports the expected diagnostic for ${fixture.id}`, () => {
      const patched = applyPatch(
        structuredClone(validObject),
        JSON.parse(readFixture(fixture.patch)) as readonly JsonPatchOperation[],
      );
      const result = parseApplicationIr(patched);

      expect(result.ok).toBe(false);

      if (result.ok) {
        throw new Error(`Expected ${fixture.id} to be invalid.`);
      }

      for (const expected of fixture.diagnostics) {
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            code: expected.code,
            irPath: expected.irPath,
          }),
        );
      }
    });
  }

  it("reports malformed JSON with a stable syntax diagnostic", () => {
    const result = parseApplicationIr('{"irVersion":');

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "IR_SYNTAX_INVALID",
          irPath: "/",
          status: "invalid",
        },
      ],
    });
  });

  it("reports malformed root structure with stable paths", () => {
    const result = parseApplicationIr({
      irVersion: "1.0.0",
      id: 42,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected malformed structure to be invalid.");
    }

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "IR_STRUCTURE_INVALID",
        irPath: "/id",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "IR_STRUCTURE_INVALID",
        irPath: "/routes",
      }),
    );
  });

  it("rejects duplicate declaration identifiers", () => {
    const duplicate = structuredClone(validObject);
    const routes = duplicate.routes as Record<string, Record<string, unknown>>;
    routes["route:duplicate"] = {
      ...(routes["route:items"] ?? {}),
      id: "route:items",
      path: "/duplicate",
    };

    const result = parseApplicationIr(duplicate);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected duplicate identifiers to be invalid.");
    }

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "IR_DUPLICATE_IDENTIFIER",
        irPath: "/routes/route:duplicate/id",
      }),
    );
  });

  it("throws an OUI-owned error from the assertion API", () => {
    expect(() => assertApplicationIr('{"irVersion":')).toThrow(
      ApplicationIrValidationError,
    );
  });
});

function readFixture(relativePath: string): string {
  return readFileSync(`${fixtureDirectory}${relativePath}`, "utf8");
}

function applyPatch(
  document: Record<string, unknown>,
  operations: readonly JsonPatchOperation[],
): Record<string, unknown> {
  for (const operation of operations) {
    const segments = operation.path
      .split("/")
      .slice(1)
      .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
    const key = segments.pop();

    if (key === undefined) {
      throw new Error(`Invalid fixture patch path: ${operation.path}`);
    }

    let parent: Record<string, unknown> | unknown[] = document;

    for (const segment of segments) {
      const next = Array.isArray(parent)
        ? parent[Number(segment)]
        : parent[segment];

      if (
        typeof next !== "object" ||
        next === null ||
        (!Array.isArray(next) &&
          Object.getPrototypeOf(next) !== Object.prototype)
      ) {
        throw new Error(
          `Fixture patch path does not resolve: ${operation.path}`,
        );
      }

      parent = next as Record<string, unknown> | unknown[];
    }

    if (Array.isArray(parent)) {
      parent[Number(key)] = operation.value;
    } else {
      parent[key] = operation.value;
    }
  }

  return document;
}

describe("to-many relationships", () => {
  it("refuses a to-many relationship that does not say where its records live", () => {
    // Without itemsPath a consumer has nothing to render, and the previous
    // behaviour was to read a field of the parent instead — which displayed
    // the parent's own value under the child collection's label.
    const patched = structuredClone(validObject) as unknown as {
      resources: Record<
        string,
        { relationships: Record<string, Record<string, unknown>> }
      >;
    };
    delete patched.resources["resource:item"].relationships[
      "relationship:item.related"
    ].itemsPath;

    const result = parseApplicationIr(patched as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the IR to be invalid.");
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.irPath.endsWith(
          "/relationships/relationship:item.related/itemsPath",
        ),
      ),
    ).toBe(true);
  });
});
