import type { CommandDefinition } from "@envelope/core";

export type SettingsCommandDependencies = {
  updateSettings: (next: {
    theme?: "dark" | "light";
    density?: "comfortable" | "compact";
    keymap?: "superhuman" | "vim";
    contrast?: "standard" | "high";
    hideRareLabels?: boolean;
  }) => Promise<void> | void;
};

export const buildSettingsCommands = (deps: SettingsCommandDependencies): CommandDefinition[] => [
  {
    id: "ui.toggleTheme",
    version: 1,
    scope: ["global", "settings", "compose", "thread", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Toggle theme",
      category: "Settings",
      keywords: ["theme", "dark", "light"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      await deps.updateSettings({ theme: ctx.ui.theme === "dark" ? "light" : "dark" });
      return { status: "success" };
    },
  },
  {
    id: "ui.toggleDensity",
    version: 1,
    scope: ["global", "settings", "compose", "thread", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Toggle density",
      category: "Settings",
      keywords: ["density", "compact", "comfortable"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      await deps.updateSettings({
        density: ctx.ui.density === "comfortable" ? "compact" : "comfortable",
      });
      return { status: "success" };
    },
  },
  {
    id: "ui.toggleVimMode",
    version: 1,
    scope: ["global", "settings", "compose", "thread", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Toggle vim keymap",
      category: "Settings",
      keywords: ["vim", "keymap"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      await deps.updateSettings({
        keymap: ctx.ui.keymap === "superhuman" ? "vim" : "superhuman",
      });
      return { status: "success" };
    },
  },
  {
    id: "ui.toggleContrast",
    version: 1,
    scope: ["global", "settings", "compose", "thread", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Toggle high contrast",
      category: "Settings",
      keywords: ["contrast", "high contrast"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      await deps.updateSettings({
        contrast: ctx.ui.contrast === "high" ? "standard" : "high",
      });
      return { status: "success" };
    },
  },
  {
    id: "ui.toggleRareLabels",
    version: 1,
    scope: ["global", "settings", "inbox"],
    availability: () => true,
    presentation: {
      title: "Toggle rare labels visibility",
      category: "Settings",
      keywords: ["labels", "rare"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      await deps.updateSettings({
        hideRareLabels: !ctx.ui.hideRareLabels,
      });
      return { status: "success" };
    },
  },
];
