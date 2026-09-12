import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertApplicationIr, type ApplicationDefinition } from "@oui/core";
import {
  RouteParameterError,
  buildRoutePath,
  createRouteManifest,
  resolveNavigation,
  toTanStackPath,
  validatePathParameters,
  validateSearchParameters,
} from "./contract";

const fixtureDirectory = fileURLToPath(
  new URL("../../../fixtures/reference/", import.meta.url),
);
const application = assertApplicationIr(
  readFileSync(`${fixtureDirectory}application.ir.json`, "utf8"),
);

describe("generated route contract", () => {
  it("matches the canonical generated route manifest", () => {
    const expected = JSON.parse(
      readFileSync(
        `${fixtureDirectory}expected/route-tree.generated.json`,
        "utf8",
      ),
    ) as unknown;

    expect(createRouteManifest(application)).toEqual(expected);
  });

  it("converts nested IR paths to TanStack paths and validates parameters", () => {
    const collection = requireRoute("route:items");
    const detail = requireRoute("route:item-detail");
    const edit = requireRoute("route:item-edit");

    expect(toTanStackPath(detail, collection)).toBe("$itemId");
    expect(toTanStackPath(edit, detail)).toBe("edit");
    expect(buildRoutePath(detail, { itemId: "item/42" })).toBe(
      "/items/item%2F42",
    );
    expect(validatePathParameters(detail, { itemId: "item:42" })).toEqual({
      itemId: "item:42",
    });
    expect(() => validatePathParameters(detail, {})).toThrowError(
      expect.objectContaining({
        code: "ROUTE_PATH_PARAMETER_MISSING",
      }),
    );
  });

  it("parses structured search values and applies defaults", () => {
    const route = requireRoute("route:items");

    expect(
      validateSearchParameters(route, {
        query: "compressor",
        status: ["open", "scheduled"],
      }),
    ).toEqual({
      query: "compressor",
      status: ["open", "scheduled"],
      page: "",
      sort: "title",
      direction: "ascending",
    });
    expect(
      validateSearchParameters(route, {
        query: "compressor",
        ignored: "discard me",
      }),
    ).toEqual({
      query: "compressor",
      page: "",
      sort: "title",
      direction: "ascending",
    });
  });

  it("rejects undeclared search values when the route requests strictness", () => {
    const route = requireRoute("route:item-edit");

    expect(() =>
      validateSearchParameters(route, { unexpected: "value" }),
    ).toThrowError(
      expect.objectContaining({
        code: "ROUTE_SEARCH_PARAMETER_UNKNOWN",
      }),
    );
  });

  it("resolves navigation only through declared routes", () => {
    const entries = resolveNavigation(application);

    expect(entries[0]).toMatchObject({
      id: "navigation:items",
      routeId: "route:items",
      href: "/items",
      unavailable: false,
    });
    expect(entries[1]?.children[0]).toMatchObject({
      routeId: "route:proposal-decision",
      unavailable: true,
    });

    const invalid = structuredClone(application) as {
      navigation: {
        items: Array<{
          route?: string;
        }>;
      };
    };
    const first = invalid.navigation.items[0];
    if (first === undefined) {
      throw new Error("Expected fixture navigation.");
    }
    first.route = "route:unknown";

    expect(() =>
      resolveNavigation(invalid as unknown as ApplicationDefinition),
    ).toThrowError(RouteParameterError);
  });
});

function requireRoute(id: string) {
  const route = application.routes[id];
  if (route === undefined) {
    throw new Error(`Fixture route ${id} is missing.`);
  }
  return route;
}
