export const routerAdapterContract = "oui.router@1" as const;

export { createMemoryHistory } from "@tanstack/react-router";

export {
  RouteParameterError,
  buildRoutePath,
  createRouteManifest,
  resolveNavigation,
  toTanStackPath,
  validatePathParameters,
  validateSearchParameters,
} from "./contract";
export type {
  GeneratedRouteManifest,
  GeneratedRouteManifestEntry,
  ResolvedNavigationEntry,
  RouteParameterErrorCode,
  RoutePathParameters,
  RouteSearchParameters,
} from "./contract";
export { OUIRouterProvider, createOUIRouter } from "./router";
export type {
  CreateOUIRouterOptions,
  OUIInteractionComponentProps,
  OUIInteractionModule,
  OUIInteractionPattern,
  OUIRouterExtensionImplementations,
  OUIRouterProviderProps,
  OUIRouterRuntime,
} from "./router";
