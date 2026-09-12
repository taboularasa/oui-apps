import { frameworkIdentity } from "@oui/core";

export const reactAdapterIdentity =
  `${frameworkIdentity}/react` as "@oui/core/react";

export {
  OUIApplicationRoot,
  applicationProviderOrder,
  createApplication,
  useOUIApplication,
  useOUIRuntime,
  useOUISession,
} from "./application";
export type {
  ApplicationBootstrap,
  ApplicationBootstrapFailure,
  ApplicationBootstrapReady,
  CreateApplicationOptions,
  OUIApplicationRootProps,
} from "./application";
export { OUIThemeProvider, useOUITheme } from "./theme";
export type { OUIThemeContextValue, OUIThemeProviderProps } from "./theme";
