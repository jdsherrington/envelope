import { describe, expect, test } from "bun:test";
import { SettingsRegistry } from "./registry";

describe("SettingsRegistry", () => {
  test("applies defaults and validates values", () => {
    const registry = new SettingsRegistry();
    registry.registerDefaults();

    const settings = registry.apply({
      theme: "light",
      keymap: "vim",
      density: "compact",
      accent: "blue",
    });
    expect(settings.theme).toBe("light");
    expect(settings.keymap).toBe("vim");
    expect(settings.density).toBe("compact");
    expect(settings.accent).toBe("blue");
    expect(settings.hideRareLabels).toBe(true);
  });

  test("falls back when values are invalid", () => {
    const registry = new SettingsRegistry();
    registry.registerDefaults();

    const settings = registry.apply({
      theme: "invalid" as never,
      accent: "chartreuse" as never,
      hideRareLabels: "yes" as never,
    });

    expect(settings.theme).toBe("system");
    expect(settings.accent).toBe("amber");
    expect(settings.hideRareLabels).toBe(true);
  });
});
