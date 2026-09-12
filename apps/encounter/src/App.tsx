import { useMemo, useState } from "react";
import type { Density } from "@oui/core";
import { OUIApplicationRoot, OUIThemeProvider } from "@oui/react";
import { Inline, Selection } from "@oui/react-aria";
import {
  OUIRouterProvider,
  createOUIRouter,
  type CreateOUIRouterOptions,
} from "@oui/router";
import { dawnTheme, midnightTheme } from "@oui/theme-default";
import type { EncounterApplicationComposition } from "./application";
import { EncounterApplicationProvider } from "./encounter-context";

const themeOptions = [
  { id: dawnTheme.id, label: dawnTheme.label },
  { id: midnightTheme.id, label: midnightTheme.label },
] as const;

const densityOptions = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
] as const;

export interface AppProps {
  readonly composition: EncounterApplicationComposition;
  readonly history?: CreateOUIRouterOptions["history"];
  readonly basePath?: string;
}

/**
 * Every route, navigation item, and rendered region below comes from the
 * compiled application IR. Nothing here names an encounter field or status:
 * the interaction patterns read them from the same declarations the BFF plan
 * was compiled from.
 */
export function App({
  composition,
  history,
  basePath = import.meta.env.BASE_URL,
}: AppProps) {
  const [themeId, setThemeId] = useState<string>(dawnTheme.id);
  const [density, setDensity] = useState<Density>("comfortable");
  const theme = themeId === midnightTheme.id ? midnightTheme : dawnTheme;

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
    <OUIThemeProvider density={density} theme={theme}>
      <section className="encounter-controls" aria-label="Appearance">
        <Inline>
          <Selection
            label="Theme"
            onSelectionChange={setThemeId}
            options={themeOptions}
            selectedKey={themeId}
          />
          <Selection
            label="Density"
            onSelectionChange={(value) => {
              setDensity(value as Density);
            }}
            options={densityOptions}
            selectedKey={density}
          />
        </Inline>
      </section>
      <OUIApplicationRoot bootstrap={composition.applicationBootstrap}>
        <EncounterApplicationProvider composition={composition}>
          <OUIRouterProvider runtime={routerRuntime} />
        </EncounterApplicationProvider>
      </OUIApplicationRoot>
    </OUIThemeProvider>
  );
}
