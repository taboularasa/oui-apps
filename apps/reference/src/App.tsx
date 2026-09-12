import { useMemo, useState } from "react";
import { OUIApplicationRoot, OUIThemeProvider } from "@oui/react";
import { Field, Inline, Selection } from "@oui/react-aria";
import {
  OUIRouterProvider,
  createOUIRouter,
  type CreateOUIRouterOptions,
} from "@oui/router";
import { dawnTheme, midnightTheme } from "@oui/theme-default";
import type { Density } from "@oui/core";
import type { ReferenceApplicationComposition } from "./application";
import { ReferenceApplicationProvider } from "./reference-context";

const themeOptions = [
  { id: dawnTheme.id, label: dawnTheme.label },
  { id: midnightTheme.id, label: midnightTheme.label },
] as const;

const densityOptions = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
] as const;

export interface AppProps {
  readonly composition: ReferenceApplicationComposition;
  readonly history?: CreateOUIRouterOptions["history"];
  readonly basePath?: string;
}

export function App({
  composition,
  history,
  basePath = import.meta.env.BASE_URL,
}: AppProps) {
  const [themeId, setThemeId] = useState(dawnTheme.id);
  const [density, setDensity] = useState<Density>("comfortable");
  const [draft, setDraft] = useState("");
  const theme = themeId === midnightTheme.id ? midnightTheme : dawnTheme;
  const routerRuntime = useMemo(
    () =>
      createOUIRouter({
        application: composition.applicationBootstrap.application,
        extensions: composition.extensionCatalog,
        session: composition.applicationBootstrap.runtime.session,
        ...(history === undefined ? {} : { history }),
        ...(basePath === "/" ? {} : { basePath }),
        navigationPathParameters: {
          "route:proposal-decision": {
            proposalId: "browser-proposal",
          },
        },
      }),
    [basePath, composition, history],
  );

  return (
    <OUIThemeProvider density={density} theme={theme}>
      <section className="reference-controls" aria-label="Appearance">
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
          <Field
            label="State-preservation example"
            onChange={setDraft}
            value={draft}
          />
        </Inline>
      </section>
      <OUIApplicationRoot bootstrap={composition.applicationBootstrap}>
        <ReferenceApplicationProvider composition={composition}>
          <OUIRouterProvider runtime={routerRuntime} />
        </ReferenceApplicationProvider>
      </OUIApplicationRoot>
    </OUIThemeProvider>
  );
}
