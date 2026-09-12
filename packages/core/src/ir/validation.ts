import type { ApplicationDefinition } from "./types";

export type IrCompatibility = "compatible" | "incompatible";

export type IrConformanceStatus = "invalid" | "unsupported";

export type IrConformanceDimension = "capability" | "structural";

export type IrSeverity = "error" | "fatal";

export type IrDiagnosticCode =
  | "IR_CONSTRAINT_PARAMETERS_INVALID"
  | "IR_DUPLICATE_IDENTIFIER"
  | "IR_REQUIRED_CAPABILITY_UNKNOWN"
  | "IR_REQUIRED_CAPABILITY_VERSION"
  | "IR_REFERENCE_CYCLE"
  | "IR_REFERENCE_UNRESOLVED"
  | "IR_STRUCTURE_INVALID"
  | "IR_SYNTAX_INVALID"
  | "IR_UNKNOWN_INTERACTION_KIND"
  | "IR_VERSION_EXCLUDED_PATCH"
  | "IR_VERSION_INVALID"
  | "IR_VERSION_MISSING"
  | "IR_VERSION_UNSUPPORTED_MAJOR"
  | "IR_VERSION_UNSUPPORTED_MINOR"
  | "OUI_EXTENSION_CAPABILITY_MISSING"
  | "OUI_EXTENSION_IR_RANGE_UNSUPPORTED";

export interface IrDiagnostic {
  readonly code: IrDiagnosticCode;
  readonly status: IrConformanceStatus;
  readonly severity: IrSeverity;
  readonly dimension: IrConformanceDimension;
  readonly message: string;
  readonly irPath: string;
  readonly expected?: string;
  readonly actual?: string;
}

export interface IrSupport {
  readonly major: number;
  readonly minimumMinor: number;
  readonly maximumMinor: number;
  readonly excluded: readonly string[];
}

export interface IrValidationSuccess {
  readonly ok: true;
  readonly compatibility: "compatible";
  readonly application: ApplicationDefinition;
  readonly diagnostics: readonly IrDiagnostic[];
}

export interface IrValidationFailure {
  readonly ok: false;
  readonly compatibility: "incompatible";
  readonly diagnostics: readonly IrDiagnostic[];
}

export type IrValidationResult = IrValidationFailure | IrValidationSuccess;

export const defaultIrSupport: IrSupport = Object.freeze({
  major: 1,
  minimumMinor: 0,
  maximumMinor: 0,
  excluded: Object.freeze([]),
});

const interactionKinds = new Set(["collection", "decision", "detail", "form"]);
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

type UnknownRecord = Record<string, unknown>;

interface DeclarationSets {
  readonly commands: Set<string>;
  readonly interactions: Set<string>;
  readonly permissions: Set<string>;
  readonly queries: Set<string>;
  readonly resources: Set<string>;
  readonly routes: Set<string>;
  readonly services: Set<string>;
}

class DiagnosticCollector {
  readonly diagnostics: IrDiagnostic[] = [];

  add(
    code: IrDiagnosticCode,
    message: string,
    irPath: string,
    options: {
      readonly actual?: string;
      readonly dimension?: IrConformanceDimension;
      readonly expected?: string;
      readonly severity?: IrSeverity;
      readonly status?: IrConformanceStatus;
    } = {},
  ): void {
    this.diagnostics.push(
      Object.freeze({
        code,
        status: options.status ?? "invalid",
        severity: options.severity ?? "error",
        dimension: options.dimension ?? "structural",
        message,
        irPath,
        ...(options.expected === undefined
          ? {}
          : { expected: options.expected }),
        ...(options.actual === undefined ? {} : { actual: options.actual }),
      }),
    );
  }

  failure(): IrValidationFailure {
    return Object.freeze({
      ok: false,
      compatibility: "incompatible",
      diagnostics: Object.freeze([...this.diagnostics]),
    });
  }
}

export class ApplicationIrValidationError extends Error {
  readonly diagnostics: readonly IrDiagnostic[];

  constructor(diagnostics: readonly IrDiagnostic[]) {
    super(
      diagnostics.length === 1
        ? `Application IR validation failed: ${diagnostics[0]?.message ?? "unknown error"}`
        : `Application IR validation failed with ${String(diagnostics.length)} diagnostics.`,
    );
    this.name = "ApplicationIrValidationError";
    this.diagnostics = diagnostics;
  }
}

export function parseApplicationIr(
  source: string | unknown,
  support: IrSupport = defaultIrSupport,
): IrValidationResult {
  const collector = new DiagnosticCollector();
  const input = parseSource(source, collector);

  if (input === undefined) {
    return collector.failure();
  }

  if (!isRecord(input)) {
    collector.add(
      "IR_STRUCTURE_INVALID",
      "The application IR root must be an object.",
      "/",
      { expected: "object", actual: describe(input), severity: "fatal" },
    );
    return collector.failure();
  }

  if (!validateVersion(input, support, collector)) {
    return collector.failure();
  }

  const maps = validateRootStructure(input, collector);

  if (maps === undefined) {
    return collector.failure();
  }

  const declarations = collectDeclarations(maps, collector);
  validateConstraints(maps.resources, collector);
  validateReferences(input, maps, declarations, collector);

  if (collector.diagnostics.length > 0) {
    return collector.failure();
  }

  const application = deepFreeze(
    structuredClone(input),
  ) as unknown as ApplicationDefinition;

  return Object.freeze({
    ok: true,
    compatibility: "compatible",
    application,
    diagnostics: Object.freeze([]),
  });
}

export function assertApplicationIr(
  source: string | unknown,
  support: IrSupport = defaultIrSupport,
): ApplicationDefinition {
  const result = parseApplicationIr(source, support);

  if (!result.ok) {
    throw new ApplicationIrValidationError(result.diagnostics);
  }

  return result.application;
}

function parseSource(
  source: string | unknown,
  collector: DiagnosticCollector,
): unknown {
  if (typeof source !== "string") {
    return source;
  }

  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    collector.add(
      "IR_SYNTAX_INVALID",
      error instanceof Error
        ? `Application IR is not valid JSON: ${error.message}`
        : "Application IR is not valid JSON.",
      "/",
      { severity: "fatal" },
    );
    return undefined;
  }
}

function validateVersion(
  input: UnknownRecord,
  support: IrSupport,
  collector: DiagnosticCollector,
): boolean {
  if (!Object.hasOwn(input, "irVersion")) {
    collector.add(
      "IR_VERSION_MISSING",
      "The application IR must declare irVersion.",
      "/irVersion",
      { severity: "fatal" },
    );
    return false;
  }

  const value = input.irVersion;

  if (typeof value !== "string") {
    collector.add(
      "IR_VERSION_INVALID",
      "irVersion must use MAJOR.MINOR.PATCH.",
      "/irVersion",
      {
        expected: "MAJOR.MINOR.PATCH",
        actual: describe(value),
        severity: "fatal",
      },
    );
    return false;
  }

  const match = versionPattern.exec(value);

  if (match === null) {
    collector.add(
      "IR_VERSION_INVALID",
      "irVersion must use MAJOR.MINOR.PATCH.",
      "/irVersion",
      { expected: "MAJOR.MINOR.PATCH", actual: value, severity: "fatal" },
    );
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (major !== support.major) {
    collector.add(
      "IR_VERSION_UNSUPPORTED_MAJOR",
      `IR major version ${String(major)} is not supported.`,
      "/irVersion",
      {
        expected: `${String(support.major)}.x.x`,
        actual: value,
        severity: "fatal",
        status: "unsupported",
      },
    );
    return false;
  }

  if (minor < support.minimumMinor || minor > support.maximumMinor) {
    collector.add(
      "IR_VERSION_UNSUPPORTED_MINOR",
      `IR minor version ${String(minor)} is outside the supported range.`,
      "/irVersion",
      {
        expected: `${String(support.major)}.${String(support.minimumMinor)}-${String(support.maximumMinor)}.x`,
        actual: value,
        severity: "fatal",
        status: "unsupported",
      },
    );
    return false;
  }

  if (support.excluded.includes(value)) {
    collector.add(
      "IR_VERSION_EXCLUDED_PATCH",
      `IR version ${value} is explicitly excluded.`,
      "/irVersion",
      { actual: value, severity: "fatal", status: "unsupported" },
    );
    return false;
  }

  return true;
}

interface RootMaps {
  readonly commands: UnknownRecord;
  readonly interactions: UnknownRecord;
  readonly queries: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly routes: UnknownRecord;
  readonly services: UnknownRecord;
}

function validateRootStructure(
  input: UnknownRecord,
  collector: DiagnosticCollector,
): RootMaps | undefined {
  requireString(input, "id", "/", collector);
  requireArray(input, "requiredCapabilities", "/", collector);
  requireRecord(input, "metadata", "/", collector);
  const routes = requireRecord(input, "routes", "/", collector);
  const navigation = requireRecord(input, "navigation", "/", collector);
  const resources = requireRecord(input, "resources", "/", collector);
  const queries = requireRecord(input, "queries", "/", collector);
  const commands = requireRecord(input, "commands", "/", collector);
  const interactions = requireRecord(input, "interactions", "/", collector);
  const services = requireRecord(input, "serviceBindings", "/", collector);
  requireRecord(input, "presentation", "/", collector);

  if (navigation !== undefined) {
    requireArray(navigation, "items", "/navigation", collector);
    requireRecord(navigation, "landmarkLabel", "/navigation", collector);
  }

  if (
    routes === undefined ||
    resources === undefined ||
    queries === undefined ||
    commands === undefined ||
    interactions === undefined ||
    services === undefined ||
    collector.diagnostics.length > 0
  ) {
    return undefined;
  }

  const maps = { commands, interactions, queries, resources, routes, services };
  validateRequiredShapes(input, maps, collector);

  return collector.diagnostics.length > 0 ? undefined : maps;
}

function validateRequiredShapes(
  input: UnknownRecord,
  maps: RootMaps,
  collector: DiagnosticCollector,
): void {
  const metadata = input.metadata as UnknownRecord;
  requireRecord(metadata, "name", "/metadata", collector);
  const defaultLocale = requireString(
    metadata,
    "defaultLocale",
    "/metadata",
    collector,
  );
  const supportedLocales = requireArray(
    metadata,
    "supportedLocales",
    "/metadata",
    collector,
  );

  if (
    defaultLocale !== undefined &&
    supportedLocales !== undefined &&
    !supportedLocales.includes(defaultLocale)
  ) {
    collector.add(
      "IR_STRUCTURE_INVALID",
      "supportedLocales must contain defaultLocale.",
      "/metadata/supportedLocales",
      { expected: `contains ${defaultLocale}` },
    );
  }

  for (const [key, value] of Object.entries(maps.routes)) {
    if (!isRecord(value)) {
      continue;
    }

    requireString(value, "path", `/routes/${escapePointer(key)}`, collector);
    requireString(
      value,
      "interaction",
      `/routes/${escapePointer(key)}`,
      collector,
    );
    requireArray(
      value,
      "pathParameters",
      `/routes/${escapePointer(key)}`,
      collector,
    );
    requireArray(
      value,
      "searchParameters",
      `/routes/${escapePointer(key)}`,
      collector,
    );
  }

  for (const [resourceKey, resourceValue] of Object.entries(maps.resources)) {
    if (!isRecord(resourceValue)) {
      continue;
    }

    const path = `/resources/${escapePointer(resourceKey)}`;
    requireRecord(resourceValue, "label", path, collector);
    requireRecord(resourceValue, "pluralLabel", path, collector);
    requireString(resourceValue, "identityField", path, collector);
    const fields = requireRecord(resourceValue, "fields", path, collector);
    requireRecord(resourceValue, "states", path, collector);
    requireRecord(resourceValue, "relationships", path, collector);

    if (fields === undefined || Object.keys(fields).length === 0) {
      collector.add(
        "IR_STRUCTURE_INVALID",
        "A resource must declare at least one field.",
        `${path}/fields`,
        { expected: "non-empty object" },
      );
      continue;
    }

    for (const [fieldKey, fieldValue] of Object.entries(fields)) {
      if (!isRecord(fieldValue)) {
        collector.add(
          "IR_STRUCTURE_INVALID",
          "Field declaration must be an object.",
          `${path}/fields/${escapePointer(fieldKey)}`,
          { expected: "object", actual: describe(fieldValue) },
        );
        continue;
      }

      const fieldPath = `${path}/fields/${escapePointer(fieldKey)}`;
      requireRecord(fieldValue, "label", fieldPath, collector);
      requireString(fieldValue, "valueType", fieldPath, collector);
      validateCardinality(
        fieldValue.cardinality,
        `${fieldPath}/cardinality`,
        collector,
      );

      if (typeof fieldValue.readOnly !== "boolean") {
        collector.add(
          "IR_STRUCTURE_INVALID",
          "readOnly must be a boolean.",
          `${fieldPath}/readOnly`,
          { expected: "boolean", actual: describe(fieldValue.readOnly) },
        );
      }

      requireArray(fieldValue, "validation", fieldPath, collector);
    }
  }

  validateOperationShapes(maps.queries, "queries", collector);
  validateOperationShapes(maps.commands, "commands", collector);

  for (const [key, value] of Object.entries(maps.interactions)) {
    if (!isRecord(value)) {
      continue;
    }

    const path = `/interactions/${escapePointer(key)}`;
    requireString(value, "kind", path, collector);
    requireString(value, "intent", path, collector);
    requireRecord(value, "label", path, collector);
    requireArray(value, "queries", path, collector);
    requireArray(value, "commands", path, collector);
    requireArray(value, "regions", path, collector);
  }

  for (const [key, value] of Object.entries(maps.services)) {
    if (!isRecord(value)) {
      continue;
    }

    const path = `/serviceBindings/${escapePointer(key)}`;
    const protocol = requireString(value, "protocol", path, collector);
    requireString(value, "serviceType", path, collector);
    requireString(value, "endpoint", path, collector);
    requireArray(value, "capabilities", path, collector);

    if (protocol !== undefined && protocol !== "connect") {
      collector.add(
        "IR_STRUCTURE_INVALID",
        "The minimum IR contract supports only Connect service bindings.",
        `${path}/protocol`,
        { expected: "connect", actual: protocol },
      );
    }
  }

  const presentation = input.presentation as UnknownRecord;
  requireRecord(presentation, "theme", "/presentation", collector);
  requireString(presentation, "density", "/presentation", collector);
  requireString(presentation, "locale", "/presentation", collector);
  const shell = requireRecord(
    presentation,
    "shell",
    "/presentation",
    collector,
  );

  if (shell !== undefined) {
    requireArray(shell, "regions", "/presentation/shell", collector);
    requireRecord(shell, "skipLink", "/presentation/shell", collector);
  }
}

function validateOperationShapes(
  operations: UnknownRecord,
  category: "commands" | "queries",
  collector: DiagnosticCollector,
): void {
  for (const [key, value] of Object.entries(operations)) {
    if (!isRecord(value)) {
      continue;
    }

    const path = `/${category}/${escapePointer(key)}`;
    requireString(value, "service", path, collector);
    requireString(value, "method", path, collector);
    requireRecord(value, "input", path, collector);
    requireRecord(value, "output", path, collector);

    if (category === "queries") {
      requireRecord(value, "cache", path, collector);
    } else {
      requireString(value, "idempotency", path, collector);
      requireString(value, "consequence", path, collector);
      requireArray(value, "invalidates", path, collector);
    }
  }
}

function validateCardinality(
  value: unknown,
  path: string,
  collector: DiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add(
      "IR_STRUCTURE_INVALID",
      "Cardinality must be an object.",
      path,
      { expected: "object", actual: describe(value) },
    );
    return;
  }

  const minimumValid =
    Number.isInteger(value.minimum) && (value.minimum as number) >= 0;
  const maximumValid =
    value.maximum === null ||
    (Number.isInteger(value.maximum) && (value.maximum as number) >= 0);

  if (
    !minimumValid ||
    !maximumValid ||
    (typeof value.maximum === "number" &&
      typeof value.minimum === "number" &&
      value.maximum < value.minimum)
  ) {
    collector.add(
      "IR_STRUCTURE_INVALID",
      "Cardinality must use non-negative bounds with maximum >= minimum.",
      path,
      {
        expected:
          "{ minimum: integer >= 0, maximum: integer >= minimum | null }",
      },
    );
  }
}

function collectDeclarations(
  maps: RootMaps,
  collector: DiagnosticCollector,
): DeclarationSets {
  const permissions = new Set<string>();

  const declarations: DeclarationSets = {
    commands: validateDeclarationMap(maps.commands, "commands", collector),
    interactions: validateDeclarationMap(
      maps.interactions,
      "interactions",
      collector,
    ),
    permissions,
    queries: validateDeclarationMap(maps.queries, "queries", collector),
    resources: validateDeclarationMap(maps.resources, "resources", collector),
    routes: validateDeclarationMap(maps.routes, "routes", collector),
    services: validateDeclarationMap(
      maps.services,
      "serviceBindings",
      collector,
    ),
  };

  return declarations;
}

function validateDeclarationMap(
  map: UnknownRecord,
  category: string,
  collector: DiagnosticCollector,
): Set<string> {
  const identifiers = new Set<string>();

  for (const [key, value] of Object.entries(map)) {
    const path = `/${category}/${escapePointer(key)}`;

    if (!isRecord(value)) {
      collector.add(
        "IR_STRUCTURE_INVALID",
        `Declaration ${key} must be an object.`,
        path,
        { expected: "object", actual: describe(value) },
      );
      continue;
    }

    if (typeof value.id !== "string" || value.id.length === 0) {
      collector.add(
        "IR_STRUCTURE_INVALID",
        `Declaration ${key} must have a non-empty id.`,
        `${path}/id`,
        { expected: "non-empty string", actual: describe(value.id) },
      );
      continue;
    }

    if (identifiers.has(value.id)) {
      collector.add(
        "IR_DUPLICATE_IDENTIFIER",
        `Identifier ${value.id} is duplicated in ${category}.`,
        `${path}/id`,
        { actual: value.id },
      );
    }

    identifiers.add(value.id);

    if (value.id !== key) {
      collector.add(
        "IR_STRUCTURE_INVALID",
        `Declaration key ${key} does not match id ${value.id}.`,
        `${path}/id`,
        { expected: key, actual: value.id },
      );
    }
  }

  return identifiers;
}

function validateConstraints(
  resources: UnknownRecord,
  collector: DiagnosticCollector,
): void {
  for (const [resourceKey, resourceValue] of Object.entries(resources)) {
    if (!isRecord(resourceValue) || !isRecord(resourceValue.fields)) {
      continue;
    }

    for (const [fieldKey, fieldValue] of Object.entries(resourceValue.fields)) {
      if (!isRecord(fieldValue) || !Array.isArray(fieldValue.validation)) {
        continue;
      }

      fieldValue.validation.forEach((constraint, index) => {
        if (!isRecord(constraint)) {
          collector.add(
            "IR_STRUCTURE_INVALID",
            "Validation constraint must be an object.",
            `/resources/${escapePointer(resourceKey)}/fields/${escapePointer(fieldKey)}/validation/${String(index)}`,
            { expected: "object", actual: describe(constraint) },
          );
          return;
        }

        if (!isRecord(constraint.parameters)) {
          collector.add(
            "IR_STRUCTURE_INVALID",
            "Validation constraint parameters must be an object.",
            `/resources/${escapePointer(resourceKey)}/fields/${escapePointer(fieldKey)}/validation/${String(index)}/parameters`,
            {
              expected: "object",
              actual: describe(constraint.parameters),
            },
          );
          return;
        }

        if (
          constraint.kind === "minimum_length" &&
          (!Number.isInteger(constraint.parameters.minimum) ||
            (constraint.parameters.minimum as number) < 0)
        ) {
          collector.add(
            "IR_CONSTRAINT_PARAMETERS_INVALID",
            "minimum_length requires a non-negative integer minimum.",
            `/resources/${escapePointer(resourceKey)}/fields/${escapePointer(fieldKey)}/validation/${String(index)}/parameters/minimum`,
            {
              expected: "non-negative integer",
              actual: describe(constraint.parameters.minimum),
            },
          );
        }
      });
    }
  }
}

function validateReferences(
  input: UnknownRecord,
  maps: RootMaps,
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  const permissionDefinitions = getPermissionDefinitions(input);
  declarations.permissions.clear();

  for (const id of validateDeclarationMap(
    permissionDefinitions,
    "permissions/definitions",
    collector,
  )) {
    declarations.permissions.add(id);
  }

  validateRoutes(maps.routes, declarations, collector);
  validateNavigation(input.navigation, declarations, collector);
  validateResources(maps.resources, declarations, collector);
  validateOperations(maps.queries, "queries", declarations, collector);
  validateOperations(maps.commands, "commands", declarations, collector);
  validateInteractions(
    maps.interactions,
    maps.resources,
    declarations,
    collector,
  );
}

function validateRoutes(
  routes: UnknownRecord,
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  const parentByRoute = new Map<string, string>();

  for (const [key, value] of Object.entries(routes)) {
    if (!isRecord(value)) {
      continue;
    }

    expectReference(
      declarations.interactions,
      value.interaction,
      `/routes/${escapePointer(key)}/interaction`,
      "interaction",
      collector,
    );

    if (value.parent !== undefined) {
      expectReference(
        declarations.routes,
        value.parent,
        `/routes/${escapePointer(key)}/parent`,
        "route",
        collector,
      );

      if (typeof value.parent === "string") {
        parentByRoute.set(key, value.parent);
      }
    }

    validatePermissionExpression(
      value.requiredPermissions,
      `/routes/${escapePointer(key)}/requiredPermissions`,
      declarations.permissions,
      collector,
    );
  }

  for (const route of parentByRoute.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = route;

    while (current !== undefined) {
      if (seen.has(current)) {
        collector.add(
          "IR_REFERENCE_CYCLE",
          `Route parent cycle includes ${current}.`,
          `/routes/${escapePointer(route)}/parent`,
        );
        break;
      }

      seen.add(current);
      current = parentByRoute.get(current);
    }
  }
}

function validateNavigation(
  navigation: unknown,
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  if (!isRecord(navigation) || !Array.isArray(navigation.items)) {
    return;
  }

  const visit = (items: readonly unknown[], path: string): void => {
    items.forEach((item, index) => {
      const itemPath = `${path}/${String(index)}`;

      if (!isRecord(item)) {
        return;
      }

      if (item.route !== undefined) {
        expectReference(
          declarations.routes,
          item.route,
          `${itemPath}/route`,
          "route",
          collector,
        );
      }

      validatePermissionExpression(
        item.requiredPermissions,
        `${itemPath}/requiredPermissions`,
        declarations.permissions,
        collector,
      );

      if (Array.isArray(item.children)) {
        visit(item.children, `${itemPath}/children`);
      }
    });
  };

  visit(navigation.items, "/navigation/items");
}

function validateResources(
  resources: UnknownRecord,
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  for (const [resourceKey, resourceValue] of Object.entries(resources)) {
    if (!isRecord(resourceValue) || !isRecord(resourceValue.fields)) {
      continue;
    }

    const fieldIds = validateDeclarationMap(
      resourceValue.fields,
      `resources/${escapePointer(resourceKey)}/fields`,
      collector,
    );

    expectReference(
      fieldIds,
      resourceValue.identityField,
      `/resources/${escapePointer(resourceKey)}/identityField`,
      "field",
      collector,
    );

    for (const [fieldKey, fieldValue] of Object.entries(resourceValue.fields)) {
      if (!isRecord(fieldValue)) {
        continue;
      }

      if (
        fieldValue.valueType === "reference" &&
        isRecord(fieldValue.valueTypeParameters)
      ) {
        expectReference(
          declarations.resources,
          fieldValue.valueTypeParameters.resource,
          `/resources/${escapePointer(resourceKey)}/fields/${escapePointer(fieldKey)}/valueTypeParameters/resource`,
          "resource",
          collector,
        );
      }

      validatePermissionExpression(
        fieldValue.requiredPermissions,
        `/resources/${escapePointer(resourceKey)}/fields/${escapePointer(fieldKey)}/requiredPermissions`,
        declarations.permissions,
        collector,
      );
    }

    if (isRecord(resourceValue.relationships)) {
      for (const [relationshipKey, relationshipValue] of Object.entries(
        resourceValue.relationships,
      )) {
        if (!isRecord(relationshipValue)) {
          continue;
        }

        // A to-many relationship names no field of the subject resource: no
        // single field of a parent can stand for a collection of children. It
        // names where the children live in the response instead.
        const maximum = isRecord(relationshipValue.cardinality)
          ? relationshipValue.cardinality.maximum
          : 1;
        const toMany =
          maximum === null || (typeof maximum === "number" && maximum > 1);
        if (toMany) {
          if (
            typeof relationshipValue.itemsPath !== "string" ||
            relationshipValue.itemsPath === ""
          ) {
            collector.add(
              "IR_STRUCTURE_INVALID",
              "A to-many relationship must declare itemsPath, the place its related records live in the response.",
              `/resources/${escapePointer(resourceKey)}/relationships/${escapePointer(relationshipKey)}/itemsPath`,
              {
                expected: "non-empty string",
                actual: describe(relationshipValue.itemsPath),
              },
            );
          }
        } else {
          expectReference(
            fieldIds,
            relationshipValue.field,
            `/resources/${escapePointer(resourceKey)}/relationships/${escapePointer(relationshipKey)}/field`,
            "field",
            collector,
          );
        }
        expectReference(
          declarations.resources,
          relationshipValue.target,
          `/resources/${escapePointer(resourceKey)}/relationships/${escapePointer(relationshipKey)}/target`,
          "resource",
          collector,
        );
      }
    }
  }
}

function validateOperations(
  operations: UnknownRecord,
  category: "commands" | "queries",
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  for (const [key, value] of Object.entries(operations)) {
    if (!isRecord(value)) {
      continue;
    }

    expectReference(
      declarations.services,
      value.service,
      `/${category}/${escapePointer(key)}/service`,
      "service",
      collector,
    );

    if (isRecord(value.output)) {
      expectReference(
        declarations.resources,
        value.output.resource,
        `/${category}/${escapePointer(key)}/output/resource`,
        "resource",
        collector,
      );
    }

    validatePermissionExpression(
      value.requiredPermissions,
      `/${category}/${escapePointer(key)}/requiredPermissions`,
      declarations.permissions,
      collector,
    );

    if (category === "commands" && Array.isArray(value.invalidates)) {
      value.invalidates.forEach((query, index) => {
        expectReference(
          declarations.queries,
          query,
          `/commands/${escapePointer(key)}/invalidates/${String(index)}`,
          "query",
          collector,
        );
      });
    }
  }
}

function validateInteractions(
  interactions: UnknownRecord,
  resources: UnknownRecord,
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  for (const [key, value] of Object.entries(interactions)) {
    if (!isRecord(value)) {
      continue;
    }

    const path = `/interactions/${escapePointer(key)}`;

    if (typeof value.kind !== "string" || !interactionKinds.has(value.kind)) {
      collector.add(
        "IR_UNKNOWN_INTERACTION_KIND",
        `Interaction kind ${describe(value.kind)} is not supported.`,
        `${path}/kind`,
        {
          dimension: "capability",
          severity: "fatal",
          status: "unsupported",
          expected: [...interactionKinds].join(", "),
          actual: describe(value.kind),
        },
      );
    }

    if (value.subject !== undefined) {
      expectReference(
        declarations.resources,
        value.subject,
        `${path}/subject`,
        "resource",
        collector,
      );
    }

    if (Array.isArray(value.queries)) {
      value.queries.forEach((query, index) => {
        expectReference(
          declarations.queries,
          query,
          `${path}/queries/${String(index)}`,
          "query",
          collector,
        );
      });
    }

    if (Array.isArray(value.commands)) {
      value.commands.forEach((command, index) => {
        expectReference(
          declarations.commands,
          command,
          `${path}/commands/${String(index)}`,
          "command",
          collector,
        );
      });
    }

    validatePermissionExpression(
      value.requiredPermissions,
      `${path}/requiredPermissions`,
      declarations.permissions,
      collector,
    );

    const fields =
      typeof value.subject === "string" && isRecord(resources[value.subject])
        ? getDeclarationIdentifiers(
            (resources[value.subject] as UnknownRecord).fields,
          )
        : new Set<string>();

    validateInteractionSpecialization(
      value,
      path,
      fields,
      declarations,
      collector,
    );
  }
}

function validateInteractionSpecialization(
  interaction: UnknownRecord,
  path: string,
  fields: Set<string>,
  declarations: DeclarationSets,
  collector: DiagnosticCollector,
): void {
  if (interaction.kind === "collection" && isRecord(interaction.collection)) {
    expectReference(
      declarations.queries,
      interaction.collection.query,
      `${path}/collection/query`,
      "query",
      collector,
    );
    expectReference(
      fields,
      interaction.collection.identityField,
      `${path}/collection/identityField`,
      "field",
      collector,
    );
    validateReferenceArray(
      fields,
      interaction.collection.visibleFields,
      `${path}/collection/visibleFields`,
      "field",
      collector,
    );

    if (interaction.collection.itemRoute !== undefined) {
      expectReference(
        declarations.routes,
        interaction.collection.itemRoute,
        `${path}/collection/itemRoute`,
        "route",
        collector,
      );
    }
  }

  if (interaction.kind === "detail" && isRecord(interaction.detail)) {
    expectReference(
      declarations.queries,
      interaction.detail.query,
      `${path}/detail/query`,
      "query",
      collector,
    );
    expectReference(
      fields,
      interaction.detail.titleField,
      `${path}/detail/titleField`,
      "field",
      collector,
    );

    if (interaction.detail.editRoute !== undefined) {
      expectReference(
        declarations.routes,
        interaction.detail.editRoute,
        `${path}/detail/editRoute`,
        "route",
        collector,
      );
    }
  }

  if (interaction.kind === "form" && isRecord(interaction.form)) {
    validateReferenceArray(
      fields,
      interaction.form.fields,
      `${path}/form/fields`,
      "field",
      collector,
    );
    expectReference(
      declarations.commands,
      interaction.form.submitCommand,
      `${path}/form/submitCommand`,
      "command",
      collector,
    );

    if (interaction.form.cancelRoute !== undefined) {
      expectReference(
        declarations.routes,
        interaction.form.cancelRoute,
        `${path}/form/cancelRoute`,
        "route",
        collector,
      );
    }
  }

  if (interaction.kind === "decision" && isRecord(interaction.decision)) {
    expectReference(
      declarations.queries,
      interaction.decision.query,
      `${path}/decision/query`,
      "query",
      collector,
    );

    if (Array.isArray(interaction.decision.alternatives)) {
      interaction.decision.alternatives.forEach((alternative, index) => {
        if (!isRecord(alternative)) {
          return;
        }

        expectReference(
          declarations.commands,
          alternative.command,
          `${path}/decision/alternatives/${String(index)}/command`,
          "command",
          collector,
        );
        validatePermissionExpression(
          alternative.requiredPermissions,
          `${path}/decision/alternatives/${String(index)}/requiredPermissions`,
          declarations.permissions,
          collector,
        );
      });
    }
  }

  if (Array.isArray(interaction.regions)) {
    interaction.regions.forEach((region, index) => {
      if (!isRecord(region)) {
        return;
      }

      validateReferenceArray(
        fields,
        region.fields,
        `${path}/regions/${String(index)}/fields`,
        "field",
        collector,
      );

      if (region.sourceField !== undefined) {
        expectReference(
          fields,
          region.sourceField,
          `${path}/regions/${String(index)}/sourceField`,
          "field",
          collector,
        );
      }
    });
  }
}

function validatePermissionExpression(
  expression: unknown,
  path: string,
  permissions: Set<string>,
  collector: DiagnosticCollector,
): void {
  if (expression === undefined) {
    return;
  }

  if (!isRecord(expression)) {
    collector.add(
      "IR_STRUCTURE_INVALID",
      "Permission expression must be an object.",
      path,
      { expected: "object", actual: describe(expression) },
    );
    return;
  }

  if (expression.kind === "permission") {
    expectReference(
      permissions,
      expression.permission,
      `${path}/permission`,
      "permission",
      collector,
    );
    return;
  }

  if (
    (expression.kind === "all_of" || expression.kind === "any_of") &&
    Array.isArray(expression.operands)
  ) {
    expression.operands.forEach((operand, index) => {
      validatePermissionExpression(
        operand,
        `${path}/operands/${String(index)}`,
        permissions,
        collector,
      );
    });
    return;
  }

  if (expression.kind === "not") {
    validatePermissionExpression(
      expression.operand,
      `${path}/operand`,
      permissions,
      collector,
    );
  }
}

function validateReferenceArray(
  identifiers: Set<string>,
  values: unknown,
  path: string,
  category: string,
  collector: DiagnosticCollector,
): void {
  if (!Array.isArray(values)) {
    return;
  }

  values.forEach((value, index) => {
    expectReference(
      identifiers,
      value,
      `${path}/${String(index)}`,
      category,
      collector,
    );
  });
}

function expectReference(
  identifiers: Set<string>,
  value: unknown,
  path: string,
  category: string,
  collector: DiagnosticCollector,
): void {
  if (typeof value !== "string") {
    collector.add(
      "IR_STRUCTURE_INVALID",
      `${category} reference must be a string.`,
      path,
      { expected: `${category} identifier`, actual: describe(value) },
    );
    return;
  }

  if (!identifiers.has(value)) {
    collector.add(
      "IR_REFERENCE_UNRESOLVED",
      `${category} reference ${value} does not resolve.`,
      path,
      { expected: `existing ${category} identifier`, actual: value },
    );
  }
}

function getPermissionDefinitions(input: UnknownRecord): UnknownRecord {
  return isRecord(input.permissions) && isRecord(input.permissions.definitions)
    ? input.permissions.definitions
    : {};
}

function getDeclarationIdentifiers(value: unknown): Set<string> {
  if (!isRecord(value)) {
    return new Set();
  }

  return new Set(
    Object.values(value)
      .filter(isRecord)
      .map((declaration) => declaration.id)
      .filter((id): id is string => typeof id === "string"),
  );
}

function requireString(
  object: UnknownRecord,
  key: string,
  path: string,
  collector: DiagnosticCollector,
): string | undefined {
  const value = object[key];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  collector.add(
    "IR_STRUCTURE_INVALID",
    `${key} must be a non-empty string.`,
    joinPointer(path, key),
    { expected: "non-empty string", actual: describe(value) },
  );
  return undefined;
}

function requireArray(
  object: UnknownRecord,
  key: string,
  path: string,
  collector: DiagnosticCollector,
): readonly unknown[] | undefined {
  const value = object[key];

  if (Array.isArray(value)) {
    return value;
  }

  collector.add(
    "IR_STRUCTURE_INVALID",
    `${key} must be an array.`,
    joinPointer(path, key),
    { expected: "array", actual: describe(value) },
  );
  return undefined;
}

function requireRecord(
  object: UnknownRecord,
  key: string,
  path: string,
  collector: DiagnosticCollector,
): UnknownRecord | undefined {
  const value = object[key];

  if (isRecord(value)) {
    return value;
  }

  collector.add(
    "IR_STRUCTURE_INVALID",
    `${key} must be an object.`,
    joinPointer(path, key),
    { expected: "object", actual: describe(value) },
  );
  return undefined;
}

function joinPointer(parent: string, key: string): string {
  return parent === "/"
    ? `/${escapePointer(key)}`
    : `${parent}/${escapePointer(key)}`;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "string") {
    return value;
  }

  return typeof value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
