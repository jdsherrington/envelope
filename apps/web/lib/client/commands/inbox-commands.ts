import type { CommandDefinition, CommandResult } from "@envelope/core";

export type InboxCommandDependencies = {
  navigate: (href: string) => void;
  focusSearch: () => void;
  updateSettings: (next: {
    theme?: "dark" | "light";
    density?: "comfortable" | "compact";
    keymap?: "superhuman" | "vim";
    contrast?: "standard" | "high";
    hideRareLabels?: boolean;
  }) => Promise<void> | void;
  openThread: (threadId: string, accountId: string) => void;
  archiveThreads: (accountId: string, threadIds: string[]) => Promise<{ jobId: string }>;
  trashThreads: (accountId: string, threadIds: string[]) => Promise<{ jobId: string }>;
  deleteThreads: (accountId: string, threadIds: string[]) => Promise<{ jobId: string }>;
  spamThreads: (accountId: string, threadIds: string[]) => Promise<{ jobId: string }>;
  markRead: (accountId: string, threadIds: string[]) => Promise<{ jobId: string }>;
  markUnread: (accountId: string, threadIds: string[]) => Promise<{ jobId: string }>;
  snoozeThreads: (accountId: string, threadIds: string[], remindAt: string) => Promise<{ jobId: string }>;
  remindThreads: (accountId: string, threadIds: string[], remindAt: string) => Promise<{ jobId: string }>;
  addLabel: (accountId: string, threadIds: string[], labelId: string) => Promise<{ jobId: string }>;
  removeLabel: (accountId: string, threadIds: string[], labelId: string) => Promise<{ jobId: string }>;
  refreshSync: (accountId: string) => Promise<{ jobId: string }>;
  switchAccount: (accountId: string) => void;
  selectNextThread: () => void;
  selectPreviousThread: () => void;
};

const queued = (jobId: string): CommandResult => ({ status: "queued", jobId });

export const buildInboxCommands = (deps: InboxCommandDependencies): CommandDefinition[] => [
  {
    id: "nav.goInbox",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Go to Inbox",
      category: "Navigation",
      keywords: ["inbox", "home"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "g i" }],
    execute: async () => {
      deps.navigate("/inbox");
      return { status: "success" };
    },
  },
  {
    id: "nav.openSettings",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Open settings",
      category: "Navigation",
      keywords: ["settings", "preferences"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "g s" }],
    execute: async () => {
      deps.navigate("/settings");
      return { status: "success" };
    },
  },
  {
    id: "search.open",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Focus search",
      category: "Navigation",
      keywords: ["search", "find"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "/" }],
    execute: async () => {
      deps.focusSearch();
      return { status: "success" };
    },
  },
  {
    id: "diag.showQuota",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Open diagnostics",
      subtitle: "Quota and sync health",
      category: "Diagnostics",
      keywords: ["quota", "health", "diagnostics"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "g d" }],
    execute: async () => {
      deps.navigate("/diagnostics");
      return { status: "success" };
    },
  },
  {
    id: "diag.openLogs",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Open diagnostics logs",
      category: "Diagnostics",
      keywords: ["logs", "diagnostics"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async () => {
      deps.navigate("/diagnostics#logs");
      return { status: "success" };
    },
  },
  {
    id: "diag.exportDiagnostics",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Export diagnostics JSON",
      category: "Diagnostics",
      keywords: ["export", "diagnostics", "logs"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async () => {
      deps.navigate("/api/diagnostics/export");
      return { status: "success" };
    },
  },
  {
    id: "ui.toggleTheme",
    version: 1,
    scope: ["global", "inbox"],
    availability: () => true,
    presentation: {
      title: "Toggle theme",
      category: "Settings",
      keywords: ["theme", "dark", "light"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      await deps.updateSettings({
        theme: ctx.ui.theme === "dark" ? "light" : "dark",
      });
      return { status: "success" };
    },
  },
  {
    id: "ui.toggleDensity",
    version: 1,
    scope: ["global", "inbox"],
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
    scope: ["global", "inbox"],
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
    scope: ["global", "inbox"],
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
    scope: ["global", "inbox"],
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
  {
    id: "sync.refresh",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId),
    presentation: {
      title: "Refresh account sync",
      category: "Diagnostics",
      keywords: ["refresh", "sync"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "cmd+r" }],
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.refreshSync(ctx.activeAccountId);
      return queued(result.jobId);
    },
  },
  {
    id: "account.switch",
    version: 1,
    scope: ["inbox", "global"],
    availability: () => true,
    presentation: {
      title: "Switch account",
      category: "Account",
      keywords: ["account", "switch"],
    },
    input: { type: "picker", source: "accounts.available", placeholder: "Select account" },
    confirm: { type: "none" },
    execute: async (_ctx, input) => {
      const accountId =
        typeof input === "object" && input && "accountId" in input
          ? String((input as { accountId: string }).accountId)
          : null;
      if (!accountId) {
        return { status: "error", message: "No account selected" };
      }
      deps.switchAccount(accountId);
      return { status: "success" };
    },
  },
  {
    id: "compose.new",
    version: 1,
    scope: ["global", "inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId),
    presentation: {
      title: "Compose new message",
      category: "Compose",
      keywords: ["compose", "new message"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "c" }],
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      deps.navigate(`/compose?accountId=${ctx.activeAccountId}`);
      return { status: "success" };
    },
  },
  {
    id: "thread.openSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length === 1),
    presentation: {
      title: "Open selected thread",
      category: "Thread",
      keywords: ["open", "thread"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "enter" }],
    execute: async (ctx) => {
      const threadId = ctx.selection.threadIds[0];
      if (!ctx.activeAccountId || !threadId) {
        return { status: "error", message: "No thread selected" };
      }
      deps.openThread(threadId, ctx.activeAccountId);
      return { status: "success" };
    },
  },
  {
    id: "thread.selectNext",
    version: 1,
    scope: ["inbox"],
    availability: () => true,
    presentation: {
      title: "Select next thread",
      category: "Navigation",
      keywords: ["next", "down"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "arrowdown" }, { sequence: "j", keymap: "vim" }],
    execute: async () => {
      deps.selectNextThread();
      return { status: "success" };
    },
  },
  {
    id: "thread.selectPrevious",
    version: 1,
    scope: ["inbox"],
    availability: () => true,
    presentation: {
      title: "Select previous thread",
      category: "Navigation",
      keywords: ["previous", "up"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "arrowup" }, { sequence: "k", keymap: "vim" }],
    execute: async () => {
      deps.selectPreviousThread();
      return { status: "success" };
    },
  },
  {
    id: "thread.archiveSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Archive selected",
      category: "Thread",
      keywords: ["archive"],
    },
    input: { type: "none" },
    confirm: { type: "undo", timeoutMs: 5000, undoCommandId: "thread.markUnreadSelected" },
    keybindings: [{ sequence: "e" }],
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.archiveThreads(ctx.activeAccountId, ctx.selection.threadIds);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.trashSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Move selected to trash",
      category: "Thread",
      keywords: ["trash"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "#" }],
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.trashThreads(ctx.activeAccountId, ctx.selection.threadIds);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.deleteSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Delete selected permanently",
      category: "Thread",
      danger: "destructive",
      keywords: ["delete", "permanent"],
    },
    input: { type: "none" },
    confirm: { type: "confirm", title: "Delete forever?", body: "This cannot be undone." },
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.deleteThreads(ctx.activeAccountId, ctx.selection.threadIds);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.spamSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Mark selected as spam",
      category: "Thread",
      keywords: ["spam", "junk"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.spamThreads(ctx.activeAccountId, ctx.selection.threadIds);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.markReadSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Mark selected read",
      category: "Thread",
      keywords: ["read"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "shift+r" }],
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.markRead(ctx.activeAccountId, ctx.selection.threadIds);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.markUnreadSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Mark selected unread",
      category: "Thread",
      keywords: ["unread"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "u" }],
    execute: async (ctx) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const result = await deps.markUnread(ctx.activeAccountId, ctx.selection.threadIds);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.snoozeSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Snooze selected",
      category: "Thread",
      keywords: ["snooze", "later"],
    },
    input: { type: "picker", source: "schedule.presets", placeholder: "Snooze until" },
    confirm: { type: "none" },
    execute: async (ctx, input) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const remindAt =
        typeof input === "object" && input && "sendAt" in input
          ? String((input as { sendAt: string }).sendAt)
          : null;
      if (!remindAt) {
        return { status: "error", message: "No snooze time selected" };
      }
      const result = await deps.snoozeThreads(ctx.activeAccountId, ctx.selection.threadIds, remindAt);
      return queued(result.jobId);
    },
  },
  {
    id: "thread.setReminderSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Set reminder on selected",
      category: "Thread",
      keywords: ["reminder", "later"],
    },
    input: { type: "picker", source: "schedule.presets", placeholder: "Remind me at" },
    confirm: { type: "none" },
    execute: async (ctx, input) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const remindAt =
        typeof input === "object" && input && "sendAt" in input
          ? String((input as { sendAt: string }).sendAt)
          : null;
      if (!remindAt) {
        return { status: "error", message: "No reminder time selected" };
      }
      const result = await deps.remindThreads(ctx.activeAccountId, ctx.selection.threadIds, remindAt);
      return queued(result.jobId);
    },
  },
  {
    id: "label.addToSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Add label to selected",
      category: "Label",
      keywords: ["label", "tag"],
    },
    input: { type: "picker", source: "labels.activeAccount", placeholder: "Select label" },
    confirm: { type: "none" },
    execute: async (ctx, input) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const labelId =
        typeof input === "object" && input && "providerLabelId" in input
          ? String((input as { providerLabelId: string }).providerLabelId)
          : null;
      if (!labelId) {
        return { status: "error", message: "No label selected" };
      }
      const result = await deps.addLabel(ctx.activeAccountId, ctx.selection.threadIds, labelId);
      return queued(result.jobId);
    },
  },
  {
    id: "label.removeFromSelected",
    version: 1,
    scope: ["inbox"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length > 0),
    presentation: {
      title: "Remove label from selected",
      category: "Label",
      keywords: ["label", "untag"],
    },
    input: { type: "picker", source: "labels.activeAccount", placeholder: "Select label" },
    confirm: { type: "none" },
    execute: async (ctx, input) => {
      if (!ctx.activeAccountId) {
        return { status: "error", message: "No active account" };
      }
      const labelId =
        typeof input === "object" && input && "providerLabelId" in input
          ? String((input as { providerLabelId: string }).providerLabelId)
          : null;
      if (!labelId) {
        return { status: "error", message: "No label selected" };
      }
      const result = await deps.removeLabel(ctx.activeAccountId, ctx.selection.threadIds, labelId);
      return queued(result.jobId);
    },
  },
];
