import {
  semanticTokenNames,
  type Density,
  type SemanticTokenName,
  type SemanticTokens,
  type ThemeDefinition,
  type ThemeInput,
} from "@oui/core";

export const themeContract = "oui.theme.semantic-tokens@1" as const;

const dawnTokens = {
  "color.surface.canvas": "#f4f7fb",
  "color.surface.raised": "#ffffff",
  "color.surface.sunken": "#e8eef7",
  "color.text.primary": "#142033",
  "color.text.muted": "#51627a",
  "color.text.inverse": "#ffffff",
  "color.border.default": "#c5d0df",
  "color.border.strong": "#74849b",
  "color.action.primary": "#2856d8",
  "color.action.primaryText": "#ffffff",
  "color.status.danger": "#b42318",
  "color.status.success": "#067647",
  "typography.family.body":
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  "typography.family.mono":
    '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  "typography.size.body": "1rem",
  "typography.size.small": "0.875rem",
  "typography.size.title": "2rem",
  "typography.weight.regular": "400",
  "typography.weight.strong": "650",
  "spacing.inline": "0.75rem",
  "spacing.block": "1rem",
  "spacing.section": "2rem",
  "shape.radius.small": "0.25rem",
  "shape.radius.medium": "0.625rem",
  "shape.radius.large": "1rem",
  "elevation.raised": "0 0.125rem 0.5rem rgb(20 32 51 / 0.12)",
  "elevation.overlay": "0 1rem 3rem rgb(20 32 51 / 0.24)",
  "focus.ring.color": "#2856d8",
  "focus.ring.width": "0.1875rem",
  "focus.ring.offset": "0.125rem",
  "motion.duration.fast": "120ms",
  "motion.duration.normal": "220ms",
  "motion.easing.standard": "cubic-bezier(0.2, 0, 0, 1)",
  "density.control.height": "2.75rem",
  "density.field.gap": "0.75rem",
  "density.hitTarget.minimum": "2.75rem",
} satisfies SemanticTokens;

const midnightTokens = {
  ...dawnTokens,
  "color.surface.canvas": "#10141f",
  "color.surface.raised": "#1c2332",
  "color.surface.sunken": "#090c13",
  "color.text.primary": "#f3f6fb",
  "color.text.muted": "#aab8cc",
  "color.text.inverse": "#111827",
  "color.border.default": "#3d4a60",
  "color.border.strong": "#8795aa",
  "color.action.primary": "#9bb8ff",
  "color.action.primaryText": "#10204f",
  "color.status.danger": "#ffb4ab",
  "color.status.success": "#75d5a5",
  "elevation.raised": "0 0.125rem 0.75rem rgb(0 0 0 / 0.45)",
  "elevation.overlay": "0 1rem 3rem rgb(0 0 0 / 0.7)",
  "focus.ring.color": "#b5c9ff",
} satisfies SemanticTokens;

const density = Object.freeze({
  compact: Object.freeze({
    "spacing.inline": "0.5rem",
    "spacing.block": "0.625rem",
    "spacing.section": "1.25rem",
    "density.control.height": "2rem",
    "density.field.gap": "0.5rem",
    "density.hitTarget.minimum": "2rem",
  }),
  comfortable: Object.freeze({
    "spacing.inline": "0.75rem",
    "spacing.block": "1rem",
    "spacing.section": "2rem",
    "density.control.height": "2.75rem",
    "density.field.gap": "0.75rem",
    "density.hitTarget.minimum": "2.75rem",
  }),
}) satisfies ThemeDefinition["density"];

export const dawnTheme = freezeTheme({
  id: "theme:dawn",
  label: "Dawn",
  colorScheme: "light",
  contract: themeContract,
  tokens: dawnTokens,
  density,
});

export const midnightTheme = freezeTheme({
  id: "theme:midnight",
  label: "Midnight",
  colorScheme: "dark",
  contract: themeContract,
  tokens: midnightTokens,
  density,
});

export const defaultTheme = dawnTheme;

export function resolveTheme(
  input: ThemeInput,
  fallback: ThemeDefinition = defaultTheme,
): ThemeDefinition {
  const tokens = resolveTokens(input.tokens, fallback.tokens);
  const resolvedDensity = Object.fromEntries(
    (["compact", "comfortable"] satisfies readonly Density[]).map((name) => [
      name,
      resolvePartialTokens(input.density?.[name], fallback.density[name]),
    ]),
  ) as ThemeDefinition["density"];

  return freezeTheme({
    id: input.id.trim().length > 0 ? input.id : fallback.id,
    label: input.label.trim().length > 0 ? input.label : fallback.label,
    colorScheme: input.colorScheme ?? fallback.colorScheme,
    contract: themeContract,
    tokens,
    density: resolvedDensity,
  });
}

function resolveTokens(
  input: Partial<SemanticTokens> | undefined,
  fallback: SemanticTokens,
): SemanticTokens {
  return Object.freeze(
    Object.fromEntries(
      semanticTokenNames.map((name) => [
        name,
        safeValue(input?.[name], fallback[name]),
      ]),
    ) as Record<SemanticTokenName, string>,
  );
}

function resolvePartialTokens(
  input: Partial<SemanticTokens> | undefined,
  fallback: Partial<SemanticTokens>,
): Partial<SemanticTokens> {
  const resolved: Partial<Record<SemanticTokenName, string>> = {};

  for (const name of semanticTokenNames) {
    const fallbackValue = fallback[name];
    const inputValue = input?.[name];

    if (inputValue !== undefined && isSafeCssToken(inputValue)) {
      resolved[name] = inputValue;
    } else if (fallbackValue !== undefined && isSafeCssToken(fallbackValue)) {
      resolved[name] = fallbackValue;
    }
  }

  return Object.freeze(resolved);
}

function safeValue(value: string | undefined, fallback: string): string {
  return value !== undefined && isSafeCssToken(value) ? value : fallback;
}

function isSafeCssToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length > 0 &&
    !/[;{}]/u.test(normalized) &&
    !normalized.includes("expression(") &&
    !normalized.includes("url(")
  );
}

function freezeTheme(theme: ThemeDefinition): ThemeDefinition {
  return Object.freeze({
    ...theme,
    tokens: Object.freeze({ ...theme.tokens }),
    density: Object.freeze({
      compact: Object.freeze({ ...theme.density.compact }),
      comfortable: Object.freeze({ ...theme.density.comfortable }),
    }),
  });
}
