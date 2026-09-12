import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertApplicationIr,
  type ApplicationDefinition,
  type FieldDefinition,
  type InteractionDefinition,
} from "@oui/core";
import { OUIOperationError } from "@oui/data";
import {
  compileForm,
  mapServerValidation,
  materializeCommandInput,
  normalizeInitialValues,
  validateFormValues,
} from "./compiler";

const fixtureDirectory = fileURLToPath(
  new URL("../../../fixtures/reference/", import.meta.url),
);
const application = assertApplicationIr(
  readFileSync(`${fixtureDirectory}application.ir.json`, "utf8"),
);
const interaction = application.interactions["interaction:item-edit"];
if (interaction === undefined) {
  throw new Error("Expected the reference form interaction.");
}
const session = {
  actor: {
    id: "actor:test",
    displayName: "Test actor",
  },
  tenant: null,
  capabilities: ["permission:item.update"],
  locale: "en-US",
  timeZone: "UTC",
} as const;

describe("IR-driven form compiler", () => {
  it("compiles every supported field kind and presentation state", () => {
    const quantity = createField("field:item.quantity", "Quantity", "integer");
    const active = createField("field:item.active", "Active", "boolean", {
      presentation: { hidden: true },
    });
    const immutable = createField("field:item.immutable", "Immutable", "text", {
      readOnly: true,
    });
    const restricted = createField(
      "field:item.restricted",
      "Restricted",
      "text",
      {
        requiredPermissions: {
          kind: "permission",
          permission: "permission:item.restricted",
        },
      },
    );
    const synthetic = extendForm(
      [quantity, active, immutable, restricted],
      interaction,
    );
    const compiled = compileForm({
      application: synthetic.application,
      interaction: synthetic.interaction,
      session,
    });

    expect(
      Object.fromEntries(compiled.fields.map(({ name, kind }) => [name, kind])),
    ).toMatchObject({
      title: "text",
      status: "enum",
      owner: "relationship",
      dueAt: "date",
      quantity: "number",
      active: "boolean",
    });
    expect(compiled.fields.find(({ name }) => name === "title")?.required).toBe(
      true,
    );
    expect(compiled.fields.find(({ name }) => name === "owner")?.required).toBe(
      false,
    );
    expect(compiled.fields.find(({ name }) => name === "active")?.hidden).toBe(
      true,
    );
    expect(
      compiled.fields.find(({ name }) => name === "immutable")?.readOnly,
    ).toBe(true);
    expect(
      compiled.fields.find(({ name }) => name === "restricted")?.unavailable,
    ).toBe(true);
    expect(compiled.unsavedChanges).toBe("confirm_discard");
  });

  it("treats fields outside the released update contract as read-only", () => {
    const compiled = compileForm({ application, interaction, session });

    expect(
      Object.fromEntries(
        compiled.fields.map(({ name, readOnly }) => [name, readOnly]),
      ),
    ).toEqual({ title: false, status: true, owner: true, dueAt: true });
  });

  it("validates synchronous constraints and maps BFF violations", () => {
    const compiled = compileForm({
      application,
      interaction,
      session,
    });
    const values = normalizeInitialValues(compiled.fields, {
      "field:item.title": "",
      "field:item.status": "not-a-status",
    });

    expect(validateFormValues(compiled.fields, values, "submit")).toEqual({
      title: "Enter a title.",
    });
    expect(
      mapServerValidation(
        new OUIOperationError({
          kind: "validation",
          operationId: "command:update-item",
          message: "Invalid update.",
          retryable: false,
          details: {
            violations: [
              {
                fieldPath: "changes.title",
                message: "Choose another title.",
              },
              {
                fieldPath: "changes.unknown",
                message: "The form combination is invalid.",
              },
            ],
          },
        }),
        compiled.fields,
      ),
    ).toEqual({
      fieldErrors: {
        title: "Choose another title.",
      },
      formError: "The form combination is invalid.",
    });
  });

  it("materializes changed fields, route identity, and hidden initial state", () => {
    const compiled = compileForm({
      application,
      interaction,
      session,
    });
    const initial = normalizeInitialValues(compiled.fields, {
      "field:item.title": "Old title",
      "field:item.status": "open",
      "field:item.owner": "",
      "field:item.dueAt": "",
    });
    const input = materializeCommandInput(
      compiled.command,
      compiled.fields,
      {
        ...initial,
        title: "New title",
        status: "done",
        owner: "actor:other",
        dueAt: "2026-09-01T12:00:00Z",
      },
      {
        ...initial,
        "field:item.version": "version:7",
      },
      {
        itemId: "item:7",
      },
    );

    expect(input).toEqual({
      item_id: "item:7",
      expected_version: "version:7",
      changes: {
        title: "New title",
      },
      update_mask: ["title"],
    });
  });
});

function createField(
  id: string,
  label: string,
  valueType: string,
  overrides: Partial<FieldDefinition> = {},
): FieldDefinition {
  return {
    id,
    label: {
      id: `${id}.label`,
      fallback: label,
    },
    valueType,
    cardinality: {
      minimum: 0,
      maximum: 1,
    },
    readOnly: false,
    validation: [],
    ...overrides,
  };
}

function extendForm(
  fields: readonly FieldDefinition[],
  baseInteraction: InteractionDefinition,
): {
  readonly application: ApplicationDefinition;
  readonly interaction: InteractionDefinition;
} {
  const resource = application.resources["resource:item"];
  if (resource === undefined || baseInteraction.form === undefined) {
    throw new Error("Expected the reference item form.");
  }
  const extendedInteraction: InteractionDefinition = {
    ...baseInteraction,
    form: {
      ...baseInteraction.form,
      fields: [...baseInteraction.form.fields, ...fields.map(({ id }) => id)],
    },
  };
  return {
    application: {
      ...application,
      resources: {
        ...application.resources,
        "resource:item": {
          ...resource,
          fields: {
            ...resource.fields,
            ...Object.fromEntries(fields.map((field) => [field.id, field])),
          },
        },
      },
      interactions: {
        ...application.interactions,
        [extendedInteraction.id]: extendedInteraction,
      },
    },
    interaction: extendedInteraction,
  };
}
