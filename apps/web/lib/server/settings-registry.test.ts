import { describe, expect, test } from "bun:test";
import {
  applySettingsDefaults,
  listRegisteredSettingIds,
  normalizeSettingsPatch,
} from "./settings-registry";

describe("settings registry", () => {
  test("contains required setting keys exactly once", () => {
    expect(listRegisteredSettingIds()).toEqual([
      "contrast",
      "density",
      "hideRareLabels",
      "keymap",
      "theme",
    ]);
  });

  test("normalizes valid patches", () => {
    const patch = normalizeSettingsPatch({
      theme: "light",
      keymap: "vim",
      contrast: "high",
    });

    expect(patch).toEqual({
      theme: "light",
      keymap: "vim",
      contrast: "high",
    });
  });

  test("rejects unknown or invalid fields", () => {
    expect(() => normalizeSettingsPatch({ density: "dense" })).toThrow();
    expect(() => normalizeSettingsPatch({ foo: "bar" })).toThrow();
  });

  test("applies defaults when values are missing", () => {
    const settings = applySettingsDefaults({ theme: "light" });
    expect(settings.theme).toBe("light");
    expect(settings.contrast).toBe("standard");
    expect(settings.keymap).toBe("superhuman");
  });
});
