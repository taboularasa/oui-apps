export const semanticTokenNames = [
  "color.surface.canvas",
  "color.surface.raised",
  "color.surface.sunken",
  "color.text.primary",
  "color.text.muted",
  "color.text.inverse",
  "color.border.default",
  "color.border.strong",
  "color.action.primary",
  "color.action.primaryText",
  "color.status.danger",
  "color.status.success",
  "typography.family.body",
  "typography.family.mono",
  "typography.size.body",
  "typography.size.small",
  "typography.size.title",
  "typography.weight.regular",
  "typography.weight.strong",
  "spacing.inline",
  "spacing.block",
  "spacing.section",
  "shape.radius.small",
  "shape.radius.medium",
  "shape.radius.large",
  "elevation.raised",
  "elevation.overlay",
  "focus.ring.color",
  "focus.ring.width",
  "focus.ring.offset",
  "motion.duration.fast",
  "motion.duration.normal",
  "motion.easing.standard",
  "density.control.height",
  "density.field.gap",
  "density.hitTarget.minimum",
] as const;

export type SemanticTokenName = (typeof semanticTokenNames)[number];

export type SemanticTokens = Readonly<Record<SemanticTokenName, string>>;

export const densityNames = ["compact", "comfortable"] as const;

export type Density = (typeof densityNames)[number];

export interface ThemeDefinition {
  readonly id: string;
  readonly label: string;
  readonly colorScheme: "dark" | "light";
  readonly contract: "oui.theme.semantic-tokens@1";
  readonly tokens: SemanticTokens;
  readonly density: Readonly<Record<Density, Partial<SemanticTokens>>>;
}

export interface ThemeInput {
  readonly id: string;
  readonly label: string;
  readonly colorScheme?: "dark" | "light";
  readonly tokens?: Partial<SemanticTokens>;
  readonly density?: Partial<
    Readonly<Record<Density, Partial<SemanticTokens>>>
  >;
}

export const semanticTokenCssVariables = Object.freeze(
  Object.fromEntries(
    semanticTokenNames.map((name) => [
      name,
      `--oui-${name.replaceAll(".", "-")}`,
    ]),
  ) as Record<SemanticTokenName, `--oui-${string}`>,
);
