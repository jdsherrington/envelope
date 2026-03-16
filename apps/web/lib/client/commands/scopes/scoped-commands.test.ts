import { describe, expect, test } from "bun:test";
import type { CommandContext } from "@envelope/core";
import { buildComposeCommands } from "./compose-commands";
import { buildDiagnosticsCommands } from "./diagnostics-commands";
import { buildSettingsCommands } from "./settings-commands";
import { buildThreadCommands } from "./thread-commands";

const ctx: CommandContext = {
  userId: "u1",
  activeAccountId: "a1",
  view: {
    scope: "compose",
    route: "/compose",
  },
  selection: {
    threadIds: ["t1"],
    messageId: "m1",
  },
  capabilities: {
    provider: "gmail",
    supportsSendLater: true,
    supportsSnooze: true,
    supportsUndoSend: true,
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

describe("scoped commands", () => {
  test("settings command toggles hideRareLabels using context", async () => {
    let patch: { hideRareLabels?: boolean } | null = null;
    const command = buildSettingsCommands({
      updateSettings: async (next) => {
        patch = next;
      },
    }).find((entry) => entry.id === "ui.toggleRareLabels");

    expect(command).toBeTruthy();
    await command?.execute(ctx);
    expect(patch?.hideRareLabels).toBe(false);
  });

  test("thread reply command requires active message context", async () => {
    const command = buildThreadCommands({
      openCompose: () => {},
    }).find((entry) => entry.id === "thread.reply");

    expect(command).toBeTruthy();
    expect(command?.availability({ ...ctx, view: { scope: "thread", route: "/thread" } })).toBe(true);
    expect(
      command?.availability({
        ...ctx,
        view: { scope: "thread", route: "/thread" },
        selection: { threadIds: ["t1"], messageId: null },
      }),
    ).toBe(false);
  });

  test("compose sendLater validates picker input", async () => {
    const command = buildComposeCommands({
      send: async () => {},
      saveDraft: async () => {},
      sendLater: async () => {},
      undoSend: async () => {},
      insertSnippet: async () => {},
      insertTemplate: async () => {},
    }).find((entry) => entry.id === "compose.sendLater");

    expect(command).toBeTruthy();
    const result = await command?.execute(ctx, {});
    expect(result).toEqual({ status: "error", message: "No send time selected" });
  });

  test("diagnostics retry command routes selected job payload", async () => {
    const called: Array<{ jobId: string; accountId: string }> = [];
    const command = buildDiagnosticsCommands({
      navigate: () => {},
      exportDiagnostics: () => {},
      retryFailedJob: async (jobId, accountId) => {
        called.push({ jobId, accountId });
      },
    }).find((entry) => entry.id === "diag.retryFailedJob");

    expect(command).toBeTruthy();
    const result = await command?.execute(
      { ...ctx, view: { scope: "diagnostics", route: "/diagnostics" } },
      { jobId: "job-1", accountId: "acct-1" },
    );

    expect(result).toEqual({ status: "success" });
    expect(called).toEqual([{ jobId: "job-1", accountId: "acct-1" }]);
  });
});
