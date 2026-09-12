import type {
  ApplicationDefinition,
  FieldDefinition,
  InteractionDefinition,
  JsonValue,
  QueryDefinition,
  ResourceDefinition,
  RouteDefinition,
  SemanticRegionDefinition,
} from "@oui/core";

export interface ResourceFieldModel {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly valueType: string;
  readonly definition: FieldDefinition;
}

export interface CollectionFilterModel {
  readonly id: string;
  readonly kind: string;
  readonly searchName: string;
  readonly field?: ResourceFieldModel;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
  }[];
}

export interface CollectionPatternModel {
  readonly interaction: InteractionDefinition;
  readonly resource: ResourceDefinition;
  readonly query: QueryDefinition;
  readonly fields: readonly ResourceFieldModel[];
  readonly identityField: ResourceFieldModel;
  readonly filters: readonly CollectionFilterModel[];
  readonly sorting: {
    readonly fields: readonly ResourceFieldModel[];
    readonly defaultField: string;
    readonly defaultDirection: "ascending" | "descending";
  };
  readonly pagination: {
    readonly kind: string;
    readonly responseTokenPath: string;
  };
  readonly selection: {
    readonly minimum: number;
    readonly maximum: number | null;
  };
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly itemRoute?: RouteDefinition;
  readonly preferredVariant: "list" | "table";
}

/**
 * One relationship inside a rendered region.
 *
 * A to-one relationship projects a value onto the parent and renders as a
 * single labelled value. A to-many renders its related records, which live at
 * `itemsPath` in the detail response and are labelled by a field of the
 * TARGET resource rather than the subject.
 */
export interface RelationshipRegionModel {
  readonly id: string;
  readonly label: string;
  /** Present for a to-one relationship only. */
  readonly field?: ResourceFieldModel;
  /** Declared target route, when the relationship can be followed. */
  readonly route?: RouteDefinition;
  /** Field carrying the value the target route needs. */
  readonly identityField?: ResourceFieldModel;
  /** Present for a to-many relationship only. */
  readonly items?: {
    /** Where the related records live in the detail response. */
    readonly path: string;
    /** Field of the target resource that labels each record. */
    readonly labelField: ResourceFieldModel;
    /** Route each record links to. */
    readonly route?: RouteDefinition;
    /** Field of the target resource carrying the value that route needs. */
    readonly identityField?: ResourceFieldModel;
  };
}

export interface DetailRegionModel {
  readonly id: string;
  readonly kind: string;
  readonly fields: readonly ResourceFieldModel[];
  readonly relationships: readonly RelationshipRegionModel[];
  readonly sourceField?: ResourceFieldModel;
}

export interface DetailPatternModel {
  readonly interaction: InteractionDefinition;
  readonly resource: ResourceDefinition;
  readonly query: QueryDefinition;
  readonly identityField: ResourceFieldModel;
  readonly titleField: ResourceFieldModel;
  readonly regions: readonly DetailRegionModel[];
  readonly editRoute?: RouteDefinition;
}

export function compileCollectionPattern(
  application: ApplicationDefinition,
  interaction: InteractionDefinition,
): CollectionPatternModel {
  if (
    interaction.kind !== "collection" ||
    interaction.collection === undefined
  ) {
    throw new Error(`Interaction ${interaction.id} is not a collection.`);
  }
  const resource = requireResource(application, interaction);
  const collection = interaction.collection;
  const query = requireQuery(application, collection.query, interaction.id);
  const fields = collection.visibleFields.map((id) =>
    compileField(resource, id, interaction.id),
  );
  const identityField = compileField(
    resource,
    collection.identityField,
    interaction.id,
  );
  const supportedSorting = readStringArray(
    collection.sorting.supportedFields,
  ).map((id) => compileField(resource, id, interaction.id));
  const defaultSort = readRecord(collection.sorting.default);
  const filters = collection.filters.map((filter) => {
    const fieldId = typeof filter.field === "string" ? filter.field : undefined;
    const field =
      fieldId === undefined
        ? undefined
        : compileField(resource, fieldId, interaction.id);
    const values =
      field?.definition.valueType === "enum"
        ? readStringArray(field.definition.valueTypeParameters?.values)
        : [];
    return Object.freeze({
      id: String(filter.id),
      kind: String(filter.kind),
      searchName: parameterName(String(filter.searchParameter)),
      ...(field === undefined ? {} : { field }),
      options: Object.freeze(
        values.map((value) => ({
          id: value,
          label: humanize(value),
        })),
      ),
    });
  });
  const emptyTitle = readLocalizedFallback(collection.emptyState.title);
  const emptyDescription = readLocalizedFallback(
    collection.emptyState.description,
  );
  const itemRoute =
    collection.itemRoute === undefined
      ? undefined
      : application.routes[collection.itemRoute];
  const preferredVariant =
    interaction.presentation?.preferredVariant === "list" ? "list" : "table";

  return Object.freeze({
    interaction,
    resource,
    query,
    fields: Object.freeze(fields),
    identityField,
    filters: Object.freeze(filters),
    sorting: Object.freeze({
      fields: Object.freeze(supportedSorting),
      defaultField: fieldName(
        typeof defaultSort.field === "string"
          ? defaultSort.field
          : (supportedSorting[0]?.id ?? ""),
      ),
      defaultDirection:
        defaultSort.direction === "descending" ? "descending" : "ascending",
    }),
    pagination: Object.freeze({
      kind: String(collection.pagination.kind ?? "none"),
      responseTokenPath: String(
        query.pagination?.responseTokenPath ?? "next_page_token",
      ),
    }),
    selection: Object.freeze({
      minimum: collection.selection.minimum,
      maximum: collection.selection.maximum,
    }),
    emptyTitle: emptyTitle || "No items",
    emptyDescription,
    ...(itemRoute === undefined ? {} : { itemRoute }),
    preferredVariant,
  });
}

export function compileDetailPattern(
  application: ApplicationDefinition,
  interaction: InteractionDefinition,
): DetailPatternModel {
  if (interaction.kind !== "detail" || interaction.detail === undefined) {
    throw new Error(`Interaction ${interaction.id} is not a detail.`);
  }
  const resource = requireResource(application, interaction);
  const detail = interaction.detail;
  const query = requireQuery(application, detail.query, interaction.id);
  const regions = interaction.regions.map((region) =>
    compileRegion(application, resource, region, interaction.id),
  );
  const editRoute =
    detail.editRoute === undefined
      ? undefined
      : application.routes[detail.editRoute];

  return Object.freeze({
    interaction,
    resource,
    query,
    identityField: compileField(
      resource,
      resource.identityField,
      interaction.id,
    ),
    titleField: compileField(resource, detail.titleField, interaction.id),
    regions: Object.freeze(regions),
    ...(editRoute === undefined ? {} : { editRoute }),
  });
}

export function materializeQueryInput(
  query: QueryDefinition,
  parameters: Readonly<Record<string, string | number>>,
  search: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(query.input.bindings).map(([target, binding]) => {
        if (binding.source === "literal") {
          return [target, binding.value];
        }
        if (binding.source === "route") {
          return [target, parameters[parameterName(binding.parameter ?? "")]];
        }
        if (binding.source === "search") {
          return [target, search[parameterName(binding.parameter ?? "")]];
        }
        return [target, undefined];
      }),
    ),
  );
}

export function resourceValue(
  item: Readonly<Record<string, unknown>>,
  field: ResourceFieldModel,
): unknown {
  return item[field.id] ?? item[field.name];
}

export function buildRoutePath(
  route: RouteDefinition,
  identity: unknown,
): string {
  const identityParameter = route.pathParameters[0]?.placeholder;
  if (identityParameter === undefined) {
    return route.path;
  }
  return route.path.replace(
    `{${identityParameter}}`,
    encodeURIComponent(String(identity)),
  );
}

function compileRegion(
  application: ApplicationDefinition,
  resource: ResourceDefinition,
  region: SemanticRegionDefinition,
  interactionId: string,
): DetailRegionModel {
  return Object.freeze({
    id: region.id,
    kind: region.kind,
    fields: Object.freeze(
      (region.fields ?? []).map((id) =>
        compileField(resource, id, interactionId),
      ),
    ),
    relationships: Object.freeze(
      (region.relationships ?? []).map((id) => {
        const relationship = resource.relationships[id];
        if (relationship === undefined) {
          throw new Error(
            `Interaction ${interactionId} references unknown relationship ${id}.`,
          );
        }
        // A relationship is followable only when the IR names its route.
        // The value the route needs is not always the value displayed, so the
        // identity field is declared separately and falls back to the
        // displayed field.
        const route =
          typeof relationship.route === "string"
            ? application.routes[relationship.route]
            : undefined;
        const label =
          relationship.label.fallback ??
          relationship.label.id ??
          relationship.id;

        const maximum = relationship.cardinality.maximum;
        if (maximum === null || maximum > 1) {
          // A to-many relationship reads its records from the response and
          // labels them with a field of the target resource, so both the
          // label field and the item route resolve against the target.
          const target = application.resources[relationship.target];
          if (target === undefined) {
            throw new Error(
              `Relationship ${id} targets unknown resource ${relationship.target}.`,
            );
          }
          if (typeof relationship.itemsPath !== "string") {
            throw new Error(
              `Relationship ${id} is to-many and declares no itemsPath.`,
            );
          }
          const itemRoute =
            typeof relationship.itemRoute === "string"
              ? application.routes[relationship.itemRoute]
              : undefined;
          const labelFieldId =
            typeof relationship.itemLabelField === "string"
              ? relationship.itemLabelField
              : target.display?.titleField;
          if (labelFieldId === undefined) {
            throw new Error(
              `Relationship ${id} is to-many and declares no itemLabelField.`,
            );
          }
          return Object.freeze({
            id,
            label,
            items: Object.freeze({
              path: relationship.itemsPath,
              labelField: compileField(target, labelFieldId, interactionId),
              ...(itemRoute === undefined ? {} : { route: itemRoute }),
              ...(itemRoute === undefined ||
              typeof relationship.itemIdentityField !== "string"
                ? {}
                : {
                    identityField: compileField(
                      target,
                      relationship.itemIdentityField,
                      interactionId,
                    ),
                  }),
            }),
          });
        }

        if (typeof relationship.field !== "string") {
          throw new Error(
            `Relationship ${id} is to-one and declares no field.`,
          );
        }
        const identityFieldId =
          typeof relationship.identityField === "string"
            ? relationship.identityField
            : relationship.field;
        return Object.freeze({
          id,
          label,
          field: compileField(resource, relationship.field, interactionId),
          ...(route === undefined ? {} : { route }),
          ...(route === undefined
            ? {}
            : {
                identityField: compileField(
                  resource,
                  identityFieldId,
                  interactionId,
                ),
              }),
        });
      }),
    ),
    ...(region.sourceField === undefined
      ? {}
      : {
          sourceField: compileField(
            resource,
            region.sourceField,
            interactionId,
          ),
        }),
  });
}

function requireResource(
  application: ApplicationDefinition,
  interaction: InteractionDefinition,
): ResourceDefinition {
  const resource =
    interaction.subject === undefined
      ? undefined
      : application.resources[interaction.subject];
  if (resource === undefined) {
    throw new Error(
      `Interaction ${interaction.id} has no declared subject resource.`,
    );
  }
  return resource;
}

function requireQuery(
  application: ApplicationDefinition,
  id: string,
  interactionId: string,
): QueryDefinition {
  const query = application.queries[id];
  if (query === undefined) {
    throw new Error(
      `Interaction ${interactionId} references unknown query ${id}.`,
    );
  }
  return query;
}

function compileField(
  resource: ResourceDefinition,
  id: string,
  interactionId: string,
): ResourceFieldModel {
  const definition = resource.fields[id];
  if (definition === undefined) {
    throw new Error(
      `Interaction ${interactionId} references unknown field ${id}.`,
    );
  }
  return Object.freeze({
    id,
    name: fieldName(id),
    label: definition.label.fallback ?? definition.label.id ?? id,
    valueType: definition.valueType,
    definition,
  });
}

function fieldName(id: string): string {
  const separator = Math.max(id.lastIndexOf("."), id.lastIndexOf(":"));
  return separator < 0 ? id : id.slice(separator + 1);
}

function parameterName(id: string): string {
  return id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
}

function readRecord(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, JsonValue>>)
    : {};
}

function readStringArray(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter(
        (candidate): candidate is string => typeof candidate === "string",
      )
    : [];
}

function readLocalizedFallback(value: JsonValue | undefined): string {
  const record = readRecord(value);
  return typeof record.fallback === "string"
    ? record.fallback
    : typeof record.id === "string"
      ? record.id
      : "";
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}
