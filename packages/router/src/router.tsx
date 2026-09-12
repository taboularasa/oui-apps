import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactElement,
} from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
  type AnyRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import type {
  ApplicationDefinition,
  DefaultExtensionImplementations,
  ExtensionCatalog,
  InteractionDefinition,
  JsonValue,
  PermissionExpression,
  RouteDefinition,
  SessionContext,
} from "@oui/core";
import { ApplicationShell, type NavigationItem } from "@oui/patterns";
import { Feedback, Status } from "@oui/react-aria";
import {
  buildRoutePath,
  createRouteManifest,
  resolveNavigation,
  toTanStackPath,
  validatePathParameters,
  validateSearchParameters,
  type GeneratedRouteManifest,
  type ResolvedNavigationEntry,
} from "./contract";

export interface OUIInteractionComponentProps {
  readonly interaction: InteractionDefinition;
  readonly route: RouteDefinition;
  readonly parameters: Readonly<Record<string, string | number>>;
  readonly search: Readonly<Record<string, JsonValue>>;
  readonly navigate: (href: string) => void;
  readonly resolveHref: (href: string) => string;
  readonly updateSearch: (
    updates: Readonly<Record<string, JsonValue | undefined>>,
  ) => void;
}

export interface OUIInteractionModule {
  readonly default: ComponentType<OUIInteractionComponentProps>;
}

export interface OUIInteractionPattern {
  readonly load: (
    interaction: InteractionDefinition,
  ) => Promise<OUIInteractionModule>;
}

export interface OUIRouterExtensionImplementations extends DefaultExtensionImplementations {
  readonly interaction_pattern: OUIInteractionPattern;
}

export interface CreateOUIRouterOptions {
  readonly application: ApplicationDefinition;
  readonly extensions: ExtensionCatalog<OUIRouterExtensionImplementations>;
  readonly session: SessionContext;
  readonly history?: RouterHistory;
  readonly basePath?: string;
  readonly navigationPathParameters?: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}

export interface OUIRouterRuntime {
  readonly router: AnyRouter;
  readonly manifest: GeneratedRouteManifest;
}

export interface OUIRouterProviderProps {
  readonly runtime: OUIRouterRuntime;
}

export function OUIRouterProvider({
  runtime,
}: OUIRouterProviderProps): ReactElement {
  return <RouterProvider router={runtime.router} />;
}

export function createOUIRouter({
  application,
  extensions,
  session,
  history,
  basePath,
  navigationPathParameters = {},
}: CreateOUIRouterOptions): OUIRouterRuntime {
  const lazyInteractions = new Map<
    string,
    LazyExoticComponent<ComponentType<OUIInteractionComponentProps>>
  >();
  const routerReference: { current: AnyRouter | undefined } = {
    current: undefined,
  };
  const resolvedNavigation = resolveNavigation(
    application,
    navigationPathParameters,
  );
  const resolveHref = (href: string) => resolveBasePathHref(href, basePath);

  const rootRoute = createRootRoute({
    component: () => (
      <ApplicationShell
        actor={session.actor?.displayName}
        globalFeedback={<Status label="Route status">Route ready</Status>}
        homeHref={resolveHref("/")}
        navigation={toShellNavigation(
          resolvedNavigation,
          (href) => {
            void routerReference.current?.navigate({ to: href });
          },
          resolveHref,
        )}
        productName={
          application.metadata.name.fallback ??
          application.metadata.name.id ??
          application.id
        }
      >
        <Outlet />
      </ApplicationShell>
    ),
    notFoundComponent: RouteNotFound,
  });

  const definitions = Object.values(application.routes);
  const buildRoute = (
    definition: RouteDefinition,
    parentRoute: AnyRoute,
  ): AnyRoute => {
    const generatedRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: toTanStackPath(definition),
      validateSearch: (search) => validateSearchParameters(definition, search),
      pendingComponent: RoutePending,
      errorComponent: ({ error }) => <RouteError error={error} />,
      component: () => {
        const parameters = validatePathParameters(
          definition,
          generatedRoute.useParams(),
        );
        const search = generatedRoute.useSearch() as Readonly<
          Record<string, JsonValue>
        >;
        return (
          <InteractionRoute
            application={application}
            extensions={extensions}
            interactionId={definition.interaction}
            lazyInteractions={lazyInteractions}
            navigate={(href) => {
              void routerReference.current?.navigate({ to: href });
            }}
            parameters={parameters}
            route={definition}
            resolveHref={resolveHref}
            search={search}
            session={session}
            updateSearch={(updates) => {
              const next: Record<string, JsonValue> = { ...search };
              for (const [name, value] of Object.entries(updates)) {
                if (
                  value === undefined ||
                  value === "" ||
                  (Array.isArray(value) && value.length === 0)
                ) {
                  delete next[name];
                } else {
                  next[name] = value;
                }
              }
              void routerReference.current?.navigate({
                to: buildRoutePath(definition, parameters),
                search: next,
                replace: true,
              });
            }}
          />
        );
      },
    }) as unknown as AnyRoute;
    return generatedRoute;
  };

  const routeTree = rootRoute.addChildren(
    definitions.map((definition) =>
      buildRoute(definition, rootRoute as unknown as AnyRoute),
    ),
  );
  const router = createRouter({
    routeTree,
    ...(basePath === undefined || basePath === "/"
      ? {}
      : { basepath: basePath.replace(/\/$/u, "") }),
    ...(history === undefined ? {} : { history }),
    defaultPreload: "intent",
  });
  routerReference.current = router;

  return Object.freeze({
    router,
    manifest: createRouteManifest(application),
  });
}

interface InteractionRouteProps {
  readonly application: ApplicationDefinition;
  readonly extensions: ExtensionCatalog<OUIRouterExtensionImplementations>;
  readonly interactionId: string;
  readonly lazyInteractions: Map<
    string,
    LazyExoticComponent<ComponentType<OUIInteractionComponentProps>>
  >;
  readonly navigate: (href: string) => void;
  readonly parameters: Readonly<Record<string, string | number>>;
  readonly route: RouteDefinition;
  readonly resolveHref: (href: string) => string;
  readonly search: Readonly<Record<string, JsonValue>>;
  readonly session: SessionContext;
  readonly updateSearch: (
    updates: Readonly<Record<string, JsonValue | undefined>>,
  ) => void;
}

function InteractionRoute({
  application,
  extensions,
  interactionId,
  lazyInteractions,
  navigate,
  parameters,
  route,
  resolveHref,
  search,
  session,
  updateSearch,
}: InteractionRouteProps): ReactElement {
  const interaction = application.interactions[interactionId];
  if (interaction === undefined) {
    return (
      <Feedback kind="error">
        Interaction {interactionId} is not declared.
      </Feedback>
    );
  }

  if (
    !hasPermission(route.requiredPermissions, session.capabilities) ||
    !hasPermission(interaction.requiredPermissions, session.capabilities)
  ) {
    return (
      <Feedback kind="warning">
        This interaction is unavailable for the current account.
      </Feedback>
    );
  }

  const capabilityId = `interaction.${interaction.kind}`;
  const lookup = extensions.lookup(
    "interaction_pattern",
    capabilityId,
    `/routes/${route.id}/interaction`,
  );
  if (!lookup.ok) {
    return (
      <Feedback kind="error">
        {lookup.diagnostics.map(({ message }) => message).join(" ")}
      </Feedback>
    );
  }

  const cacheKey = `${lookup.registration.id}:${interaction.id}`;
  let Component = lazyInteractions.get(cacheKey);
  if (Component === undefined) {
    Component = lazy(() =>
      lookup.registration.implementation.load(interaction),
    );
    lazyInteractions.set(cacheKey, Component);
  }

  return (
    <Suspense fallback={<RoutePending />}>
      <Component
        interaction={interaction}
        navigate={navigate}
        parameters={parameters}
        route={route}
        resolveHref={resolveHref}
        search={search}
        updateSearch={updateSearch}
      />
    </Suspense>
  );
}

function RoutePending(): ReactElement {
  return (
    <Status busy label="Route loading status">
      Loading interaction
    </Status>
  );
}

function RouteError({ error }: { readonly error: unknown }): ReactElement {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;
  const detail = error instanceof Error ? error.message : "Unknown route error";
  const message = code === undefined ? detail : `${code}: ${detail}`;

  return (
    <Feedback kind="error">This route could not be loaded: {message}</Feedback>
  );
}

function RouteNotFound(): ReactElement {
  return (
    <div>
      <h1>Page not found</h1>
      <Feedback kind="warning">
        The requested page was not found. Choose a declared navigation entry.
      </Feedback>
    </div>
  );
}

function toShellNavigation(
  entries: readonly ResolvedNavigationEntry[],
  navigate: (href: string) => void,
  resolveHref: (href: string) => string,
): readonly NavigationItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    ...(entry.href === undefined
      ? {}
      : {
          href: resolveHref(entry.href),
          onNavigate: () => {
            navigate(entry.href ?? "/");
          },
        }),
    unavailable: entry.unavailable,
    children: toShellNavigation(entry.children, navigate, resolveHref),
  }));
}

function resolveBasePathHref(
  href: string,
  basePath: string | undefined,
): string {
  if (basePath === undefined || basePath === "/") {
    return href;
  }
  const base = basePath.replace(/\/$/u, "");
  return href === "/" ? `${base}/` : `${base}${href}`;
}

function hasPermission(
  expression: PermissionExpression | undefined,
  capabilities: readonly string[],
): boolean {
  if (expression === undefined) {
    return true;
  }
  if (expression.kind === "permission") {
    return (
      expression.permission !== undefined &&
      capabilities.includes(expression.permission)
    );
  }
  if (expression.kind === "not") {
    return (
      expression.operand !== undefined &&
      !hasPermission(expression.operand, capabilities)
    );
  }
  const operands = expression.operands ?? [];
  return expression.kind === "all_of"
    ? operands.every((operand) => hasPermission(operand, capabilities))
    : operands.some((operand) => hasPermission(operand, capabilities));
}
