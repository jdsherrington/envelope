"use client";

import {
  CommandExecutor,
  CommandRegistry,
  type CommandContext,
  type CommandDefinition,
  type CommandResult,
} from "@envelope/core";
import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { cn } from "@/lib/client/cn";

type InboxAccount = {
  id: string;
  email: string;
  providerId: string;
  status: "ok" | "syncing" | "rate_limited" | "needs_reauth" | "error";
  lastSyncedAt: string | null;
};

type InboxThread = {
  id: string;
  providerThreadId: string;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  unreadCount: number;
  providerLabelIds: string[];
};

type InboxAppProps = {
  userId: string;
  initialAccountId: string | null;
  accounts: InboxAccount[];
  initialThreads: InboxThread[];
};

const buildCommandContext = (args: {
  userId: string;
  accountId: string | null;
  selectedThreadIds: string[];
  paletteOpen: boolean;
}): CommandContext => ({
  userId: args.userId,
  activeAccountId: args.accountId,
  view: {
    scope: "inbox",
    route: "/inbox",
  },
  selection: {
    threadIds: args.selectedThreadIds,
    messageId: null,
  },
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
    paletteOpen: args.paletteOpen,
  },
});

const jsonPost = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(
    url,
    withCsrfHeaders({
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
};

export function InboxApp({ userId, initialAccountId, accounts, initialThreads }: InboxAppProps) {
  const [activeAccountId, setActiveAccountId] = useState<string | null>(initialAccountId);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads, activeAccountId]);

  const commandRegistry = useMemo(() => {
    const registry = new CommandRegistry();

    const cmd = (definition: CommandDefinition): CommandDefinition => definition;

    registry.registerMany([
      cmd({
        id: "nav.goInbox",
        version: 1,
        scope: ["global", "inbox"],
        availability: () => true,
        presentation: {
          title: "Go to Inbox",
          category: "Navigation",
          keywords: ["inbox", "nav"],
        },
        input: { type: "none" },
        confirm: { type: "none" },
        keybindings: [{ sequence: "g i" }],
        execute: async () => {
          window.location.href = "/inbox";
          return { status: "success" };
        },
      }),
      cmd({
        id: "thread.openSelected",
        version: 1,
        scope: ["inbox"],
        availability: (ctx) => ctx.selection.threadIds.length === 1,
        presentation: {
          title: "Open selected thread",
          category: "Thread",
        },
        input: { type: "none" },
        confirm: { type: "none" },
        keybindings: [{ sequence: "enter" }],
        execute: async (ctx) => {
          const id = ctx.selection.threadIds[0];
          if (!ctx.activeAccountId || !id) {
            return { status: "error", message: "No thread selected" };
          }
          window.location.href = `/thread/${id}?accountId=${ctx.activeAccountId}`;
          return { status: "success" };
        },
      }),
      cmd({
        id: "thread.archiveSelected",
        version: 1,
        scope: ["inbox"],
        availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length),
        presentation: {
          title: "Archive selected",
          category: "Thread",
        },
        input: { type: "none" },
        confirm: { type: "undo", timeoutMs: 5000, undoCommandId: "thread.markUnreadSelected" },
        keybindings: [{ sequence: "e" }],
        execute: async (ctx): Promise<CommandResult> => {
          if (!ctx.activeAccountId) {
            return { status: "error", message: "No active account" };
          }

          const threadIds = [...ctx.selection.threadIds];
          setThreads((previous) => previous.filter((thread) => !threadIds.includes(thread.id)));

          const result = await jsonPost<{ jobId: string }>("/api/actions/archive", {
            accountId: ctx.activeAccountId,
            threadIds,
          });
          return { status: "queued", jobId: result.jobId };
        },
      }),
      cmd({
        id: "thread.markReadSelected",
        version: 1,
        scope: ["inbox"],
        availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length),
        presentation: {
          title: "Mark selected read",
          category: "Thread",
        },
        input: { type: "none" },
        confirm: { type: "none" },
        keybindings: [{ sequence: "shift+r" }],
        execute: async (ctx): Promise<CommandResult> => {
          if (!ctx.activeAccountId) {
            return { status: "error", message: "No active account" };
          }

          const selected = new Set(ctx.selection.threadIds);
          setThreads((previous) =>
            previous.map((thread) =>
              selected.has(thread.id)
                ? {
                    ...thread,
                    unreadCount: 0,
                  }
                : thread,
            ),
          );

          const result = await jsonPost<{ jobId: string }>("/api/actions/mark-read", {
            accountId: ctx.activeAccountId,
            threadIds: [...selected],
          });

          return { status: "queued", jobId: result.jobId };
        },
      }),
      cmd({
        id: "thread.markUnreadSelected",
        version: 1,
        scope: ["inbox"],
        availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length),
        presentation: {
          title: "Mark selected unread",
          category: "Thread",
        },
        input: { type: "none" },
        confirm: { type: "none" },
        keybindings: [{ sequence: "u" }],
        execute: async (ctx): Promise<CommandResult> => {
          if (!ctx.activeAccountId) {
            return { status: "error", message: "No active account" };
          }

          const selected = new Set(ctx.selection.threadIds);
          setThreads((previous) =>
            previous.map((thread) =>
              selected.has(thread.id)
                ? {
                    ...thread,
                    unreadCount: Math.max(thread.unreadCount, 1),
                  }
                : thread,
            ),
          );

          const result = await jsonPost<{ jobId: string }>("/api/actions/mark-unread", {
            accountId: ctx.activeAccountId,
            threadIds: [...selected],
          });

          return { status: "queued", jobId: result.jobId };
        },
      }),
      cmd({
        id: "label.addToSelected",
        version: 1,
        scope: ["inbox"],
        availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length),
        presentation: {
          title: "Add label to selected",
          category: "Label",
        },
        input: { type: "none" },
        confirm: { type: "none" },
        execute: async (ctx): Promise<CommandResult> => {
          if (!ctx.activeAccountId) {
            return { status: "error", message: "No active account" };
          }

          const labelId = window.prompt("Enter provider label id (example: STARRED)");
          if (!labelId) {
            return { status: "success" };
          }

          const result = await jsonPost<{ jobId: string }>("/api/actions/label/add", {
            accountId: ctx.activeAccountId,
            threadIds: ctx.selection.threadIds,
            labelIds: [labelId],
          });

          return { status: "queued", jobId: result.jobId };
        },
      }),
      cmd({
        id: "label.removeFromSelected",
        version: 1,
        scope: ["inbox"],
        availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length),
        presentation: {
          title: "Remove label from selected",
          category: "Label",
        },
        input: { type: "none" },
        confirm: { type: "none" },
        execute: async (ctx): Promise<CommandResult> => {
          if (!ctx.activeAccountId) {
            return { status: "error", message: "No active account" };
          }

          const labelId = window.prompt("Enter provider label id to remove");
          if (!labelId) {
            return { status: "success" };
          }

          const result = await jsonPost<{ jobId: string }>("/api/actions/label/remove", {
            accountId: ctx.activeAccountId,
            threadIds: ctx.selection.threadIds,
            labelIds: [labelId],
          });

          return { status: "queued", jobId: result.jobId };
        },
      }),
      cmd({
        id: "diag.showQuota",
        version: 1,
        scope: ["global", "inbox"],
        availability: () => true,
        presentation: {
          title: "Open diagnostics",
          subtitle: "Quota and sync health",
          category: "Diagnostics",
        },
        input: { type: "none" },
        confirm: { type: "none" },
        keybindings: [{ sequence: "g d" }],
        execute: async (): Promise<CommandResult> => {
          window.location.href = "/diagnostics";
          return { status: "success" };
        },
      }),
    ]);

    return registry;
  }, []);

  const executor = useMemo(() => new CommandExecutor(commandRegistry), [commandRegistry]);

  const commandContext = useMemo(
    () =>
      buildCommandContext({
        userId,
        accountId: activeAccountId,
        selectedThreadIds,
        paletteOpen,
      }),
    [activeAccountId, paletteOpen, selectedThreadIds, userId],
  );

  const availableCommands = useMemo(
    () => commandRegistry.listAvailable(commandContext),
    [commandContext, commandRegistry],
  );

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if (paletteOpen) {
        return;
      }

      const key = event.key.toLowerCase();
      const withModifiers = [
        event.metaKey ? "cmd" : null,
        event.ctrlKey ? "ctrl" : null,
        event.altKey ? "alt" : null,
        event.shiftKey ? "shift" : null,
        key,
      ]
        .filter(Boolean)
        .join("+");

      const command = commandRegistry.matchKeybinding(commandContext, withModifiers);
      if (!command) {
        return;
      }

      event.preventDefault();
      const result = await executor.run(command.id, commandContext);
      if (result.status === "error") {
        setErrorMessage(result.message);
      } else {
        setStatusMessage(result.status === "queued" ? `Queued: ${command.id}` : `Done: ${command.id}`);
        setErrorMessage(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [commandContext, commandRegistry, executor, paletteOpen]);

  const onPaletteCommand = async (commandId: string) => {
    const result = await executor.run(commandId, commandContext);
    if (result.status === "error") {
      setErrorMessage(result.message);
    } else {
      setStatusMessage(result.status === "queued" ? `Queued: ${commandId}` : `Done: ${commandId}`);
      setErrorMessage(null);
    }
  };

  return (
    <div className="grid min-h-dvh grid-rows-[auto,1fr] bg-stone-950 text-stone-100">
      <header className="z-nav border-b border-stone-800 bg-stone-900/95 px-4 py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-stone-500">Envelope</p>
            <h1 className="text-2xl font-semibold text-balance">Inbox</h1>
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="active-account">
              Active account
            </label>
            <select
              id="active-account"
              value={activeAccountId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setActiveAccountId(value || null);
                window.location.href = value ? `/inbox?accountId=${value}` : "/inbox";
              }}
              className="rounded-lg border border-stone-700 bg-stone-950 px-2 py-1.5 text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email} ({account.status})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/diagnostics";
              }}
              className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
            >
              Diagnostics
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4">
        {errorMessage ? (
          <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200 text-pretty">
            {errorMessage}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="mb-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 text-pretty">
            {statusMessage}
          </div>
        ) : null}

        <div className="rounded-2xl border border-stone-800 bg-stone-900/80">
          <ul role="listbox" aria-label="Thread list" className="divide-y divide-stone-800">
            {threads.length === 0 ? (
              <li className="px-4 py-12 text-center text-stone-400 text-pretty">
                <p className="text-lg text-balance">No threads yet</p>
                <p className="mt-1 text-sm">Connect Gmail and run initial sync from settings.</p>
              </li>
            ) : null}

            {threads.map((thread) => {
              const selected = selectedThreadIds.includes(thread.id);
              return (
                <li key={thread.id} aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedThreadIds((current) => {
                        if (current.includes(thread.id)) {
                          return current.filter((id) => id !== thread.id);
                        }
                        return [...current, thread.id];
                      });
                    }}
                    className={cn(
                      "grid w-full grid-cols-[auto,1fr,auto] items-center gap-3 px-4 py-3 text-left",
                      selected ? "bg-amber-500/15" : "hover:bg-stone-800",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        thread.unreadCount > 0 ? "bg-amber-400" : "bg-stone-700",
                      )}
                    />
                    <span>
                      <span className="block truncate text-sm font-medium">{thread.subject}</span>
                      <span className="block truncate text-xs text-stone-400">{thread.snippet}</span>
                    </span>
                    <span className="text-xs text-stone-400 tabular-nums">
                      {new Date(thread.lastMessageAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      <CommandPalette
        commands={availableCommands.map((command) => ({
          id: command.id,
          title: command.presentation.title,
          subtitle: command.presentation.subtitle,
          category: command.presentation.category,
        }))}
        onOpenChange={setPaletteOpen}
        onSelect={onPaletteCommand}
      />

      <div className="fixed bottom-3 right-3 rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-400">
        <p>
          <kbd className="rounded bg-stone-800 px-1.5 py-0.5 font-mono">Cmd</kbd>+
          <kbd className="rounded bg-stone-800 px-1.5 py-0.5 font-mono">K</kbd> for commands
        </p>
        <p className="mt-1">Selected: {selectedThreadIds.length}</p>
      </div>
    </div>
  );
}
