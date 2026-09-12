import { useMemo } from "react";
import { OUIApplicationRoot, OUIThemeProvider } from "@oui/react";
import {
  OUIRouterProvider,
  createOUIRouter,
  type CreateOUIRouterOptions,
} from "@oui/router";
import { dawnTheme } from "@oui/theme-default";
import type { ProfessionalServicesApplicationComposition } from "./application";
import { ProfessionalServicesApplicationProvider } from "./professional-services-context";

export interface AppProps {
  readonly composition: ProfessionalServicesApplicationComposition;
  readonly history?: CreateOUIRouterOptions["history"];
  readonly basePath?: string;
}

export function App({
  composition,
  history,
  basePath = import.meta.env.BASE_URL,
}: AppProps) {
  const routerRuntime = useMemo(
    () =>
      createOUIRouter({
        application: composition.applicationBootstrap.application,
        extensions: composition.extensionCatalog,
        session: composition.applicationBootstrap.runtime.session,
        ...(history === undefined ? {} : { history }),
        ...(basePath === "/" ? {} : { basePath }),
      }),
    [basePath, composition, history],
  );

  return (
    <OUIThemeProvider density="comfortable" theme={dawnTheme}>
      <OUIApplicationRoot bootstrap={composition.applicationBootstrap}>
        <ProfessionalServicesApplicationProvider composition={composition}>
          <OUIRouterProvider runtime={routerRuntime} />
        </ProfessionalServicesApplicationProvider>
      </OUIApplicationRoot>
    </OUIThemeProvider>
  );
}
