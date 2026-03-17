import { describe, expect, test } from "bun:test";
import { CommandRegistry } from "./registry";
import type { CommandContext } from "./types";

const ctx: CommandContext = {
  userId: "u1",
  activeAccountId: "a1",
  view: { scope: "inbox", route: "/inbox" },
  selection: { threadIds: [], messageId: null },
  capabilities: {
    provider: "gmail",
    supportsSendLater: false,
    supportsSnooze: false,
    supportsUndoSend: false,
  },
  ui: {
    density: "comfortable",
    theme: "dark",
    keymap: "superhuman",
    accent: "amber",
    hideRareLabels: true,
    paletteOpen: false,
  },
};

describe("CommandRegistry", () => {
  test("filters by scope and availability", () => {
    const registry = new CommandRegistry();

    registry.registerMany([
      {
        id: "inbox.only",
        version: 1,
        scope: ["inbox"],
        availability: () => true,
        presentation: { title: "Inbox", category: "Navigation" },
        input: { type: "none" },
        confirm: { type: "none" },
        execute: async () => ({ status: "success" }),
      },
      {
        id: "thread.requires-selection",
        version: 1,
        scope: ["thread"],
        availability: (current) => current.selection.threadIds.length > 0,
        presentation: { title: "Thread", category: "Thread" },
        input: { type: "none" },
        confirm: { type: "none" },
        execute: async () => ({ status: "success" }),
      },
    ]);

    const available = registry.listAvailable(ctx);
    expect(available.map((command) => command.id)).toEqual(["inbox.only"]);
  });

  test("matches keybinding", () => {
    const registry = new CommandRegistry();
    registry.register({
      id: "diag.open",
      version: 1,
      scope: ["inbox"],
      availability: () => true,
      presentation: { title: "Diagnostics", category: "Diagnostics" },
      input: { type: "none" },
      confirm: { type: "none" },
      keybindings: [{ sequence: "cmd+d" }],
      execute: async () => ({ status: "success" }),
    });

    expect(registry.matchKeybinding(ctx, "cmd+d")?.id).toBe("diag.open");
  });
});
