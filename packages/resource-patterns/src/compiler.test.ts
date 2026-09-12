import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertApplicationIr } from "@oui/core";
import {
  buildRoutePath,
  compileCollectionPattern,
  compileDetailPattern,
  materializeQueryInput,
} from "./compiler";
import { classifyResourceLoadState } from "./state";

const fixtureDirectory = fileURLToPath(
  new URL("../../../fixtures/reference/", import.meta.url),
);
const application = assertApplicationIr(
  readFileSync(`${fixtureDirectory}application.ir.json`, "utf8"),
);

describe("resource pattern compiler", () => {
  it("compiles collection semantics independently from presentation", () => {
    const interaction = application.interactions["interaction:item-collection"];
    if (interaction === undefined) {
      throw new Error("Expected the collection interaction.");
    }
    const model = compileCollectionPattern(application, interaction);

    expect(model.fields.map(({ name }) => name)).toEqual([
      "title",
      "status",
      "owner",
      "dueAt",
    ]);
    expect(model.filters.map(({ searchName }) => searchName)).toEqual([
      "query",
      "status",
    ]);
    expect(model.sorting).toMatchObject({
      defaultField: "title",
      defaultDirection: "ascending",
    });
    expect(model.pagination.kind).toBe("cursor");
    expect(model.selection.maximum).toBe(1);
    expect(model.itemRoute?.id).toBe("route:item-detail");
    expect(model.preferredVariant).toBe("table");
  });

  it("advertises only released BFF collection sort semantics", () => {
    const route = application.routes["route:items"];
    const interaction = application.interactions["interaction:item-collection"];
    if (route === undefined || interaction === undefined) {
      throw new Error(
        "Expected the reference collection route and interaction.",
      );
    }
    const model = compileCollectionPattern(application, interaction);
    const defaultSearch = Object.fromEntries(
      route.searchParameters.flatMap((parameter) =>
        parameter.defaultValue === undefined
          ? []
          : [
              [
                parameter.id.split(":").at(-1) ?? parameter.id,
                parameter.defaultValue,
              ],
            ],
      ),
    );

    expect(materializeQueryInput(model.query, {}, defaultSearch)).toMatchObject(
      {
        sort: "title",
        direction: "ascending",
      },
    );
    expect(defaultSearch.sort).not.toBe("dueAt");
    expect(
      model.sorting.fields.map(({ name, label }) => ({ name, label })),
    ).toEqual([
      { name: "title", label: "Title" },
      { name: "status", label: "Status" },
    ]);
  });

  it("compiles identity, attributes, relationships, history, and edit route", () => {
    const interaction = application.interactions["interaction:item-detail"];
    if (interaction === undefined) {
      throw new Error("Expected the detail interaction.");
    }
    const model = compileDetailPattern(application, interaction);

    expect(model.identityField.name).toBe("id");
    expect(model.titleField.name).toBe("title");
    expect(model.regions.map(({ kind }) => kind)).toEqual([
      "summary",
      "relationships",
      "history",
    ]);
    expect(model.regions[1]?.relationships[0]).toMatchObject({
      id: "relationship:item.owner",
      field: { name: "owner" },
    });
    expect(model.regions[2]?.sourceField?.name).toBe("history");
    expect(model.editRoute?.id).toBe("route:item-edit");
  });

  it("materializes URL state and builds declared item paths", () => {
    const interaction = application.interactions["interaction:item-collection"];
    if (interaction === undefined) {
      throw new Error("Expected the collection interaction.");
    }
    const model = compileCollectionPattern(application, interaction);

    expect(
      materializeQueryInput(
        model.query,
        {},
        {
          query: "compressor",
          status: ["open"],
          page: "page:2",
          sort: "title",
          direction: "descending",
        },
      ),
    ).toEqual({
      page_size: 25,
      page_token: "page:2",
      query: "compressor",
      statuses: ["open"],
      sort: "title",
      direction: "descending",
    });
    if (model.itemRoute === undefined) {
      throw new Error("Expected a declared item route.");
    }
    expect(buildRoutePath(model.itemRoute, "item:42")).toBe("/items/item%3A42");
  });

  it.each([
    [{ available: false }, "unavailable"],
    [{ loading: true }, "loading"],
    [{ error: new Error("failed") }, "error"],
    [{ itemCount: 0 }, "empty"],
    [{ itemCount: 1, stale: true }, "stale"],
    [{ itemCount: 1, partial: true }, "partial"],
    [{ itemCount: 1 }, "ready"],
  ] as const)("distinguishes resource state %#", (overrides, expected) => {
    expect(
      classifyResourceLoadState({
        available: true,
        loading: false,
        error: undefined,
        itemCount: 0,
        stale: false,
        partial: false,
        ...overrides,
      }),
    ).toBe(expected);
  });
});

describe("relationship cardinality", () => {
  const detail = application.interactions["interaction:item-detail"];

  it("compiles a to-one relationship to a field of its subject", () => {
    if (detail === undefined)
      throw new Error("Expected the detail interaction.");
    const model = compileDetailPattern(application, detail);
    const owner = model.regions[1]?.relationships.find(
      (relationship) => relationship.id === "relationship:item.owner",
    );
    expect(owner?.field?.name).toBe("owner");
    expect(owner?.items).toBeUndefined();
  });

  it("compiles a to-many relationship to its records rather than a field", () => {
    // A to-many names no field of the parent. Reading one anyway is what made
    // a detail render the parent's own value under the child collection's
    // label, so the compiled model must not offer one.
    if (detail === undefined)
      throw new Error("Expected the detail interaction.");
    const model = compileDetailPattern(application, detail);
    const related = model.regions[1]?.relationships.find(
      (relationship) => relationship.id === "relationship:item.related",
    );
    expect(related?.field).toBeUndefined();
    expect(related?.items?.path).toBe("related");
    // The label and identity fields resolve against the TARGET resource.
    expect(related?.items?.labelField.name).toBe("title");
    expect(related?.items?.identityField).toBeUndefined();
  });
});
