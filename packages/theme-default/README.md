# Default theme

`@oui/theme-default` implements `oui.theme.semantic-tokens@1` with CSS custom properties.

- `dawnTheme` is the default light theme.
- `midnightTheme` is a visually distinct dark theme.
- `compact` and `comfortable` density overrides change space and control sizing without changing behavior.
- forced-colors media rules defer to system colors.
- reduced-motion media rules suppress non-essential animation and transition duration.

Customer inputs are resolved through `resolveTheme`. Missing, unknown, empty, or unsafe token values fall back to a complete trusted theme.
