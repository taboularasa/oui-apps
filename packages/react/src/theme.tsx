import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  semanticTokenCssVariables,
  type Density,
  type SemanticTokenName,
  type ThemeDefinition,
} from "@oui/core";

export interface OUIThemeContextValue {
  readonly theme: ThemeDefinition;
  readonly density: Density;
}

export interface OUIThemeProviderProps {
  readonly theme: ThemeDefinition;
  readonly density: Density;
  readonly children: ReactNode;
}

const ThemeContext = createContext<OUIThemeContextValue | undefined>(undefined);

export function OUIThemeProvider({
  theme,
  density,
  children,
}: OUIThemeProviderProps) {
  const value = useMemo(
    () => Object.freeze({ theme, density }),
    [theme, density],
  );
  const style = useMemo(
    () => createThemeStyle(theme, density),
    [theme, density],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div
        className="oui-theme"
        data-oui-density={density}
        data-oui-theme={theme.id}
        style={style}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useOUITheme(): OUIThemeContextValue {
  const value = useContext(ThemeContext);

  if (value === undefined) {
    throw new Error("useOUITheme must be used within OUIThemeProvider.");
  }

  return value;
}

function createThemeStyle(
  theme: ThemeDefinition,
  density: Density,
): CSSProperties {
  const tokens = { ...theme.tokens, ...theme.density[density] };
  const properties: Record<string, string> = {
    colorScheme: theme.colorScheme,
  };

  for (const [name, value] of Object.entries(tokens) as [
    SemanticTokenName,
    string,
  ][]) {
    properties[semanticTokenCssVariables[name]] = value;
  }

  return properties as CSSProperties;
}
