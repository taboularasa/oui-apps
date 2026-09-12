import type {
  ApplicationDefinition,
  JsonValue,
  NavigationItemDefinition,
  PathParameterDefinition,
  RouteDefinition,
  SearchParameterDefinition,
} from "@oui/core";

type ParameterName<Id extends string> = Id extends `${string}:${infer Name}`
  ? Name
  : Id;

type ParameterValue<ValueType extends string> = ValueType extends
  "decimal" | "integer" | "number"
  ? number
  : ValueType extends "boolean"
    ? boolean
    : string;

type SearchParameterValue<Parameter extends SearchParameterDefinition> =
  Parameter["cardinality"] extends { readonly maximum: 1 }
    ? ParameterValue<Parameter["valueType"]>
    : Parameter["cardinality"] extends undefined
      ? ParameterValue<Parameter["valueType"]>
      : readonly ParameterValue<Parameter["valueType"]>[];

export type RoutePathParameters<Route extends RouteDefinition> = {
  readonly [
    Parameter in Route["pathParameters"][number] as Parameter["placeholder"]
  ]: ParameterValue<Parameter["valueType"]>;
};

export type RouteSearchParameters<Route extends RouteDefinition> = {
  readonly [
    Parameter in Route["searchParameters"][number] as ParameterName<
      Parameter["id"]
    >
  ]?: SearchParameterValue<Parameter>;
};

export interface GeneratedRouteManifestEntry {
  readonly id: string;
  readonly parent: string | null;
  readonly path: string;
  readonly interaction: string;
}

export interface GeneratedRouteManifest {
  readonly application: string;
  readonly irVersion: string;
  readonly routes: readonly GeneratedRouteManifestEntry[];
}

export interface ResolvedNavigationEntry {
  readonly id: string;
  readonly label: string;
  readonly routeId?: string;
  readonly href?: string;
  readonly unavailable: boolean;
  readonly children: readonly ResolvedNavigationEntry[];
}

export type RouteParameterErrorCode =
  | "ROUTE_NAVIGATION_TARGET_UNKNOWN"
  | "ROUTE_PATH_PARAMETER_INVALID"
  | "ROUTE_PATH_PARAMETER_MISSING"
  | "ROUTE_SEARCH_PARAMETER_INVALID"
  | "ROUTE_SEARCH_PARAMETER_UNKNOWN";

export class RouteParameterError extends Error {
  readonly code: RouteParameterErrorCode;
  readonly routeId: string;
  readonly parameter: string;

  constructor(
    code: RouteParameterErrorCode,
    routeId: string,
    parameter: string,
    message: string,
  ) {
    super(message);
    this.name = "RouteParameterError";
    this.code = code;
    this.routeId = routeId;
    this.parameter = parameter;
  }
}

export function createRouteManifest(
  application: ApplicationDefinition,
): GeneratedRouteManifest {
  return Object.freeze({
    application: application.id,
    irVersion: application.irVersion,
    routes: Object.freeze(
      Object.values(application.routes).map((route) =>
        Object.freeze({
          id: route.id,
          parent: route.parent ?? null,
          path: route.path,
          interaction: route.interaction,
        }),
      ),
    ),
  });
}

export function toTanStackPath(
  route: RouteDefinition,
  parent?: RouteDefinition,
): string {
  const absoluteParent = parent?.path.replace(/\/$/u, "");
  const relative =
    absoluteParent !== undefined && route.path.startsWith(`${absoluteParent}/`)
      ? route.path.slice(absoluteParent.length + 1)
      : route.path.replace(/^\//u, "");

  return relative.replace(/\{([^}]+)\}/gu, "$$$1");
}

export function buildRoutePath(
  route: RouteDefinition,
  parameters: Readonly<Record<string, unknown>>,
): string {
  validatePathParameters(route, parameters);

  return route.path.replace(/\{([^}]+)\}/gu, (_placeholder, name: string) =>
    encodeURIComponent(String(parameters[name])),
  );
}

export function validatePathParameters(
  route: RouteDefinition,
  parameters: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string | number>> {
  const parsed: Record<string, string | number> = {};

  for (const parameter of route.pathParameters) {
    const value = parameters[parameter.placeholder];
    if (value === undefined || value === null || value === "") {
      throw new RouteParameterError(
        "ROUTE_PATH_PARAMETER_MISSING",
        route.id,
        parameter.placeholder,
        `Route ${route.id} requires path parameter ${parameter.placeholder}.`,
      );
    }

    parsed[parameter.placeholder] = parsePathValue(route, parameter, value);
  }

  return Object.freeze(parsed);
}

export function validateSearchParameters(
  route: RouteDefinition,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JsonValue>> {
  const definitions = new Map(
    route.searchParameters.map((parameter) => [
      searchParameterName(parameter),
      parameter,
    ]),
  );
  const result: Record<string, JsonValue> = {};

  for (const [name, value] of Object.entries(input)) {
    const definition = definitions.get(name);
    if (definition === undefined) {
      if (route.unknownSearchParameters === "reject") {
        throw new RouteParameterError(
          "ROUTE_SEARCH_PARAMETER_UNKNOWN",
          route.id,
          name,
          `Route ${route.id} does not declare search parameter ${name}.`,
        );
      }
      if (route.unknownSearchParameters === "preserve") {
        result[name] = toJsonValue(value);
      }
      continue;
    }

    result[name] = parseSearchValue(route, definition, value);
  }

  for (const definition of route.searchParameters) {
    const name = searchParameterName(definition);
    if (result[name] === undefined && definition.defaultValue !== undefined) {
      result[name] = definition.defaultValue;
    }
  }

  return Object.freeze(result);
}

export function resolveNavigation(
  application: ApplicationDefinition,
  pathParameters: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  > = {},
): readonly ResolvedNavigationEntry[] {
  const resolveItem = (
    item: NavigationItemDefinition,
  ): ResolvedNavigationEntry => {
    const route =
      item.route === undefined ? undefined : application.routes[item.route];
    if (item.route !== undefined && route === undefined) {
      throw new RouteParameterError(
        "ROUTE_NAVIGATION_TARGET_UNKNOWN",
        item.route,
        item.id,
        `Navigation item ${item.id} targets undeclared route ${item.route}.`,
      );
    }

    const parameters =
      item.route === undefined ? undefined : pathParameters[item.route];
    const unavailable =
      route !== undefined &&
      route.pathParameters.length > 0 &&
      parameters === undefined;

    return Object.freeze({
      id: item.id,
      label: item.label.fallback ?? item.label.id ?? item.id,
      ...(route === undefined
        ? {}
        : {
            routeId: route.id,
            ...(unavailable
              ? {}
              : { href: buildRoutePath(route, parameters ?? {}) }),
          }),
      unavailable,
      children: Object.freeze(item.children.map(resolveItem)),
    });
  };

  return Object.freeze(application.navigation.items.map(resolveItem));
}

function parsePathValue(
  route: RouteDefinition,
  parameter: PathParameterDefinition,
  value: unknown,
): string | number {
  try {
    const parsed = parseScalar(parameter.valueType, value);
    if (typeof parsed !== "string" && typeof parsed !== "number") {
      throw invalidPathParameter(route, parameter, value);
    }
    return parsed;
  } catch {
    throw invalidPathParameter(route, parameter, value);
  }
}

function parseSearchValue(
  route: RouteDefinition,
  parameter: SearchParameterDefinition,
  value: unknown,
): JsonValue {
  try {
    if (parameter.cardinality !== undefined) {
      const values = Array.isArray(value) ? value : [value];
      if (
        values.length < parameter.cardinality.minimum ||
        (parameter.cardinality.maximum !== null &&
          values.length > parameter.cardinality.maximum)
      ) {
        throw new Error("cardinality");
      }
      return values.map((entry) => parseScalar(parameter.valueType, entry));
    }

    return parseScalar(parameter.valueType, value);
  } catch {
    throw new RouteParameterError(
      "ROUTE_SEARCH_PARAMETER_INVALID",
      route.id,
      searchParameterName(parameter),
      `Search parameter ${searchParameterName(parameter)} is invalid for route ${route.id}.`,
    );
  }
}

function parseScalar(valueType: string, value: unknown): JsonValue {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (
    valueType === "integer" ||
    valueType === "decimal" ||
    valueType === "number"
  ) {
    const parsed =
      typeof scalar === "number" ? scalar : Number.parseFloat(String(scalar));
    if (
      !Number.isFinite(parsed) ||
      (valueType === "integer" && !Number.isInteger(parsed))
    ) {
      throw new Error("number");
    }
    return parsed;
  }

  if (valueType === "boolean") {
    if (scalar === true || scalar === "true") {
      return true;
    }
    if (scalar === false || scalar === "false") {
      return false;
    }
    throw new Error("boolean");
  }

  if (typeof scalar !== "string") {
    throw new Error("string");
  }
  return scalar;
}

function invalidPathParameter(
  route: RouteDefinition,
  parameter: PathParameterDefinition,
  value: unknown,
): RouteParameterError {
  return new RouteParameterError(
    "ROUTE_PATH_PARAMETER_INVALID",
    route.id,
    parameter.placeholder,
    `Path parameter ${parameter.placeholder} has invalid value ${String(value)}.`,
  );
}

function searchParameterName(parameter: SearchParameterDefinition): string {
  return parameter.id.includes(":")
    ? parameter.id.slice(parameter.id.lastIndexOf(":") + 1)
    : parameter.id;
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
    );
  }
  return String(value);
}
