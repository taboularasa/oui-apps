import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { semanticTokenNames } from "@oui/core";
import { dawnTheme, midnightTheme, resolveTheme } from "./index";

describe("semantic themes", () => {
  it("defines every semantic role for light and dark themes", () => {
    for (const name of semanticTokenNames) {
      expect(dawnTheme.tokens[name]).toBeTruthy();
      expect(midnightTheme.tokens[name]).toBeTruthy();
    }

    expect(dawnTheme.colorScheme).toBe("light");
    expect(midnightTheme.colorScheme).toBe("dark");
    expect(midnightTheme.tokens["color.surface.canvas"]).not.toBe(
      dawnTheme.tokens["color.surface.canvas"],
    );
  });

  it("defines compact and comfortable density modes", () => {
    expect(dawnTheme.density.compact["density.control.height"]).toBe("2rem");
    expect(dawnTheme.density.comfortable["density.control.height"]).toBe(
      "2.75rem",
    );
  });

  it("falls back for missing and unsafe customer tokens", () => {
    const resolved = resolveTheme({
      id: "",
      label: "",
      tokens: {
        "color.surface.canvas": "url(https://unsafe.example)",
        "color.text.primary": "#221144",
      },
      density: {
        compact: {
          "density.control.height": "1.875rem",
          "density.field.gap": "red; display: none",
        },
      },
    });

    expect(resolved.id).toBe(dawnTheme.id);
    expect(resolved.tokens["color.surface.canvas"]).toBe(
      dawnTheme.tokens["color.surface.canvas"],
    );
    expect(resolved.tokens["color.text.primary"]).toBe("#221144");
    expect(resolved.tokens["spacing.section"]).toBe(
      dawnTheme.tokens["spacing.section"],
    );
    expect(resolved.density.compact["density.control.height"]).toBe("1.875rem");
    expect(resolved.density.compact["density.field.gap"]).toBe(
      dawnTheme.density.compact["density.field.gap"],
    );
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it("keeps styling implementation details out of the IR fixture", () => {
    const fixturePath = fileURLToPath(
      new URL(
        "../../../fixtures/reference/application.ir.json",
        import.meta.url,
      ),
    );
    const fixture = readFileSync(fixturePath, "utf8").toLowerCase();

    expect(fixture).not.toContain("tailwind");
    expect(fixture).not.toContain("classname");
    expect(fixture).not.toMatch(/"(?:bg|text|p|m|grid|flex)-[^"]+"/u);
  });
});
