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
      contrast: "high",
    });
    expect(settings.theme).toBe("light");
    expect(settings.keymap).toBe("vim");
    expect(settings.density).toBe("compact");
    expect(settings.contrast).toBe("high");
    expect(settings.hideRareLabels).toBe(true);
  });

  test("falls back when values are invalid", () => {
    const registry = new SettingsRegistry();
    registry.registerDefaults();

    const settings = registry.apply({
      theme: "invalid" as never,
      contrast: "extreme" as never,
      hideRareLabels: "yes" as never,
    });

    expect(settings.theme).toBe("dark");
    expect(settings.contrast).toBe("standard");
    expect(settings.hideRareLabels).toBe(true);
  });
});
