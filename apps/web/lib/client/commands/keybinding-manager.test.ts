import { describe, expect, test } from "bun:test";
import { CommandRegistry, type CommandContext } from "@envelope/core";
import { KeybindingManager } from "./keybinding-manager";

const ctx: CommandContext = {
  userId: "u1",
  activeAccountId: "a1",
  view: { scope: "inbox", route: "/inbox" },
  selection: { threadIds: ["t1"], messageId: null },
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
    contrast: "standard",
    hideRareLabels: true,
    paletteOpen: false,
  },
};

const keyboardEvent = (key: string): KeyboardEvent =>
  ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  }) as KeyboardEvent;

describe("KeybindingManager", () => {
  test("matches single keystroke bindings", () => {
    const registry = new CommandRegistry();
    registry.register({
      id: "thread.archiveSelected",
      version: 1,
      scope: ["inbox"],
      availability: () => true,
      presentation: { title: "Archive", category: "Thread" },
      input: { type: "none" },
      confirm: { type: "none" },
      keybindings: [{ sequence: "e" }],
      execute: async () => ({ status: "success" }),
    });

    const manager = new KeybindingManager();
    const result = manager.resolve(keyboardEvent("e"), ctx, registry);
    expect(result.command?.id).toBe("thread.archiveSelected");
  });

  test("matches chord bindings", () => {
    const registry = new CommandRegistry();
    registry.register({
      id: "diag.showQuota",
      version: 1,
      scope: ["inbox"],
      availability: () => true,
      presentation: { title: "Diag", category: "Diagnostics" },
      input: { type: "none" },
      confirm: { type: "none" },
      keybindings: [{ sequence: "g d" }],
      execute: async () => ({ status: "success" }),
    });

    const manager = new KeybindingManager();
    const first = manager.resolve(keyboardEvent("g"), ctx, registry);
    expect(first.command).toBeNull();

    const second = manager.resolve(keyboardEvent("d"), ctx, registry);
    expect(second.command?.id).toBe("diag.showQuota");
  });

  test("respects keymap-specific bindings", () => {
    const registry = new CommandRegistry();
    registry.register({
      id: "thread.selectNext",
      version: 1,
      scope: ["inbox"],
      availability: () => true,
      presentation: { title: "Next", category: "Navigation" },
      input: { type: "none" },
      confirm: { type: "none" },
      keybindings: [{ sequence: "j", keymap: "vim" }],
      execute: async () => ({ status: "success" }),
    });

    const manager = new KeybindingManager();
    const superhumanResult = manager.resolve(keyboardEvent("j"), ctx, registry);
    expect(superhumanResult.command).toBeNull();

    const vimCtx = { ...ctx, ui: { ...ctx.ui, keymap: "vim" as const } };
    const vimResult = manager.resolve(keyboardEvent("j"), vimCtx, registry);
    expect(vimResult.command?.id).toBe("thread.selectNext");
  });
});
