"use client";

import {
  CommandExecutor,
  CommandRegistry,
  type CommandContext,
} from "@envelope/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { cn } from "@/lib/client/cn";
import { recordPerfEvent } from "@/lib/client/perf";
import { buildInboxCommands } from "@/lib/client/commands/inbox-commands";
import { KeybindingManager } from "@/lib/client/commands/keybinding-manager";
import {
  createPickerSourceRegistry,
  type InboxAccountOption,
} from "@/lib/client/commands/picker-sources";

type InboxAccount = InboxAccountOption & {
  providerId: string;
  lastSyncedAt: string | null;
  backoffUntil: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
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

type SyncProgress = {
  inProgress: boolean;
  phase: string | null;
  processed: number;
  target: number | null;
  updatedAt?: string | null;
};

type UserSettings = {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  keymap: "superhuman" | "vim";
  contrast: "standard" | "high";
  hideRareLabels: boolean;
};

type InboxAppProps = {
  userId: string;
  initialAccountId: string | null;
  initialSettings: UserSettings;
  accounts: InboxAccount[];
  initialThreads: InboxThread[];
};

const buildCommandContext = (args: {
  userId: string;
  accountId: string | null;
  selectedThreadIds: string[];
  paletteOpen: boolean;
  settings: UserSettings;
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
    density: args.settings.density,
    theme: args.settings.theme,
    keymap: args.settings.keymap,
    contrast: args.settings.contrast,
    hideRareLabels: args.settings.hideRareLabels,
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

const postCommandEvent = async (body: {
  accountId: string | null;
  commandId: string;
  commandVersion: number;
  viewScope: string;
  selectionCount: number;
  status: "success" | "queued" | "error";
  durationMs?: number;
  errorMessage?: string;
}) => {
  try {
    await fetch(
      "/api/commands/events",
      withCsrfHeaders({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  } catch {
    // Swallow diagnostics failures; command execution should continue.
  }
};

const isSystemLabel = (labelId: string): boolean =>
  ["INBOX", "UNREAD", "IMPORTANT", "CATEGORY_PERSONAL", "CATEGORY_UPDATES", "STARRED"].includes(labelId);

const prettyLabel = (labelId: string): string =>
  labelId
    .replace(/^CATEGORY_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (char) => char.toUpperCase());

const prettySyncPhase = (phase: string | null | undefined): string => {
  if (!phase) {
    return "Inbox";
  }

  return phase
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/(^|\s)\w/g, (char) => char.toUpperCase());
};

export function InboxApp({
  userId,
  initialAccountId,
  initialSettings,
  accounts,
  initialThreads,
}: InboxAppProps) {
  const [activeAccountId, setActiveAccountId] = useState<string | null>(initialAccountId);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InboxThread[] | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);

  const keybindingManagerRef = useRef(new KeybindingManager());
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const isLight = settings.theme === "light";

  const refreshInboxThreads = useCallback(async (accountId: string) => {
    try {
      const response = await fetch(`/api/inbox?accountId=${encodeURIComponent(accountId)}&page=1`);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        items: Array<Omit<InboxThread, "lastMessageAt"> & { lastMessageAt: string }>;
      };

      setThreads(payload.items);
    } catch {
      // Ignore background refresh failures.
    }
  }, []);

  useEffect(() => {
    setThreads(initialThreads);
    setSelectedThreadIds([]);
  }, [initialThreads, activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) {
      setSyncProgress(null);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/sync/progress?accountId=${activeAccountId}`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          progress?: {
            inProgress: boolean;
            phase: string | null;
            processed: number;
            target: number | null;
            updatedAt?: string | null;
          } | null;
        };

        if (!cancelled) {
          const progress = payload.progress ?? null;
          setSyncProgress(progress);

          if (activeAccountId && !searchQuery.trim() && (progress?.inProgress || progress?.processed)) {
            await refreshInboxThreads(activeAccountId);
          }
        }
      } catch {
        // Ignore polling failures.
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeAccountId, refreshInboxThreads, searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || !activeAccountId) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/search?accountId=${encodeURIComponent(activeAccountId)}&q=${encodeURIComponent(query)}&page=1`,
          );
          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as {
            items: Array<Omit<InboxThread, "lastMessageAt"> & { lastMessageAt: string }>;
          };

          if (!cancelled) {
            setSearchResults(payload.items);
          }
        } catch {
          // Ignore search failures.
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeAccountId, searchQuery]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const update = () => {
      setViewportHeight(list.clientHeight);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const coldLoadMs = navEntry?.domContentLoadedEventEnd ?? performance.now();
    void recordPerfEvent({
      accountId: activeAccountId,
      route: "/inbox",
      metric: "cold_load_ms",
      valueMs: coldLoadMs,
    });
  }, [activeAccountId]);

  useEffect(() => {
    let frames = 0;
    const startedAt = performance.now();
    let rafId = 0;

    const tick = () => {
      frames += 1;
      const elapsed = performance.now() - startedAt;
      if (elapsed >= 1000) {
        const fps = (frames * 1000) / elapsed;
        void recordPerfEvent({
          accountId: activeAccountId,
          route: "/inbox",
          metric: "scroll_fps_sample",
          valueMs: fps,
        });
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [activeAccountId]);

  const updateSettings = useCallback(async (next: Partial<UserSettings>) => {
    setSettings((previous) => ({ ...previous, ...next }));
    try {
      const response = await jsonPost<UserSettings>("/api/settings", next);
      setSettings(response);
      window.dispatchEvent(new CustomEvent("envelope:settings:updated", { detail: response }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save settings");
    }
  }, []);

  const commandContext = useMemo(
    () =>
      buildCommandContext({
        userId,
        accountId: activeAccountId,
        selectedThreadIds,
        paletteOpen,
        settings,
      }),
    [activeAccountId, paletteOpen, selectedThreadIds, settings, userId],
  );

  const pickerRegistry = useMemo(
    () =>
      createPickerSourceRegistry({
        getAccounts: () =>
          accounts.map((account) => ({
            id: account.id,
            email: account.email,
            status: account.status,
          })),
        fetchLabels: async (accountId) => {
          const response = await fetch(`/api/labels?accountId=${accountId}`);
          if (!response.ok) {
            return [];
          }

          const payload = (await response.json()) as {
            items: Array<{ providerLabelId: string; name: string }>;
          };

          return payload.items;
        },
        fetchSnippets: async () => {
          const response = await fetch("/api/snippets");
          if (!response.ok) {
            return [];
          }

          const payload = (await response.json()) as {
            items: Array<{ id: string; title: string; body: string }>;
          };

          return payload.items;
        },
        fetchTemplates: async () => {
          const response = await fetch("/api/templates");
          if (!response.ok) {
            return [];
          }

          const payload = (await response.json()) as {
            items: Array<{ id: string; title: string; body: string }>;
          };

          return payload.items;
        },
      }),
    [accounts],
  );

  const visibleThreads = searchQuery.trim() ? (searchResults ?? []) : threads;
  const syncProgressAgeMs = syncProgress?.updatedAt
    ? Date.now() - new Date(syncProgress.updatedAt).getTime()
    : null;
  const syncLooksStale = Boolean(
    syncProgress?.inProgress && syncProgressAgeMs != null && syncProgressAgeMs > 60_000,
  );

  const commandRegistry = useMemo(() => {
    const registry = new CommandRegistry();

    const run = {
      focusSearch: () => {
        searchRef.current?.focus();
      },
      updateSettings: (next: {
        theme?: "dark" | "light";
        density?: "comfortable" | "compact";
        keymap?: "superhuman" | "vim";
        contrast?: "standard" | "high";
        hideRareLabels?: boolean;
      }) => updateSettings(next),
      openThread: (threadId: string, accountId: string) => {
        window.location.href = `/thread/${threadId}?accountId=${accountId}`;
      },
      navigate: (href: string) => {
        window.location.href = href;
      },
      switchAccount: (accountId: string) => {
        setActiveAccountId(accountId);
        window.location.href = `/inbox?accountId=${accountId}`;
      },
      selectNextThread: () => {
        if (!visibleThreads.length) {
          return;
        }

        const currentId = selectedThreadIds[0];
        if (!currentId) {
          setSelectedThreadIds([visibleThreads[0]?.id ?? ""]);
          return;
        }

        const index = visibleThreads.findIndex((thread) => thread.id === currentId);
        const nextIndex = Math.min(index + 1, visibleThreads.length - 1);
        const nextId = visibleThreads[nextIndex]?.id;
        if (nextId) {
          setSelectedThreadIds([nextId]);
        }
      },
      selectPreviousThread: () => {
        if (!visibleThreads.length) {
          return;
        }

        const currentId = selectedThreadIds[0];
        if (!currentId) {
          setSelectedThreadIds([visibleThreads[0]?.id ?? ""]);
          return;
        }

        const index = visibleThreads.findIndex((thread) => thread.id === currentId);
        const nextIndex = Math.max(index - 1, 0);
        const nextId = visibleThreads[nextIndex]?.id;
        if (nextId) {
          setSelectedThreadIds([nextId]);
        }
      },
      archiveThreads: async (accountId: string, threadIds: string[]) => {
        setThreads((previous) => previous.filter((thread) => !threadIds.includes(thread.id)));
        return jsonPost<{ jobId: string }>("/api/actions/archive", {
          accountId,
          threadIds,
        });
      },
      trashThreads: async (accountId: string, threadIds: string[]) => {
        setThreads((previous) => previous.filter((thread) => !threadIds.includes(thread.id)));
        return jsonPost<{ jobId: string }>("/api/actions/trash", {
          accountId,
          threadIds,
        });
      },
      deleteThreads: async (accountId: string, threadIds: string[]) => {
        setThreads((previous) => previous.filter((thread) => !threadIds.includes(thread.id)));
        return jsonPost<{ jobId: string }>("/api/actions/delete", {
          accountId,
          threadIds,
        });
      },
      spamThreads: async (accountId: string, threadIds: string[]) => {
        setThreads((previous) => previous.filter((thread) => !threadIds.includes(thread.id)));
        return jsonPost<{ jobId: string }>("/api/actions/spam", {
          accountId,
          threadIds,
        });
      },
      markRead: async (accountId: string, threadIds: string[]) => {
        const selected = new Set(threadIds);
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
        return jsonPost<{ jobId: string }>("/api/actions/mark-read", {
          accountId,
          threadIds,
        });
      },
      markUnread: async (accountId: string, threadIds: string[]) => {
        const selected = new Set(threadIds);
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
        return jsonPost<{ jobId: string }>("/api/actions/mark-unread", {
          accountId,
          threadIds,
        });
      },
      snoozeThreads: async (accountId: string, threadIds: string[], remindAt: string) => {
        setThreads((previous) => previous.filter((thread) => !threadIds.includes(thread.id)));
        return jsonPost<{ jobId: string }>("/api/actions/snooze", {
          accountId,
          threadIds,
          remindAt,
        });
      },
      remindThreads: async (accountId: string, threadIds: string[], remindAt: string) =>
        jsonPost<{ jobId: string }>("/api/actions/reminder", {
          accountId,
          threadIds,
          remindAt,
        }),
      addLabel: async (accountId: string, threadIds: string[], labelId: string) => {
        const selected = new Set(threadIds);
        setThreads((previous) =>
          previous.map((thread) =>
            selected.has(thread.id)
              ? {
                  ...thread,
                  providerLabelIds: Array.from(new Set([...thread.providerLabelIds, labelId])),
                }
              : thread,
          ),
        );
        return jsonPost<{ jobId: string }>("/api/actions/label/add", {
          accountId,
          threadIds,
          labelIds: [labelId],
        });
      },
      removeLabel: async (accountId: string, threadIds: string[], labelId: string) => {
        const selected = new Set(threadIds);
        setThreads((previous) =>
          previous.map((thread) =>
            selected.has(thread.id)
              ? {
                  ...thread,
                  providerLabelIds: thread.providerLabelIds.filter((entry) => entry !== labelId),
                }
              : thread,
          ),
        );
        return jsonPost<{ jobId: string }>("/api/actions/label/remove", {
          accountId,
          threadIds,
          labelIds: [labelId],
        });
      },
      refreshSync: async (accountId: string) =>
        jsonPost<{ jobId: string }>("/api/sync/refresh", {
          accountId,
        }),
    };

    registry.registerMany(buildInboxCommands(run));
    return registry;
  }, [accounts, selectedThreadIds, updateSettings, visibleThreads]);

  const executor = useMemo(
    () =>
      new CommandExecutor(commandRegistry, {
        onSucceeded: (event) => {
          const selectionCount = selectedThreadIds.length;
          const status = event.result.status === "error" ? "error" : event.result.status;

          void postCommandEvent({
            accountId: activeAccountId,
            commandId: event.commandId,
            commandVersion: event.commandVersion,
            viewScope: commandContext.view.scope,
            selectionCount,
            status,
            durationMs: Math.round(event.durationMs),
            errorMessage: event.result.status === "error" ? event.result.message : undefined,
          });
        },
        onFailed: (event) => {
          void postCommandEvent({
            accountId: activeAccountId,
            commandId: event.commandId,
            commandVersion: event.commandVersion,
            viewScope: commandContext.view.scope,
            selectionCount: selectedThreadIds.length,
            status: "error",
            durationMs: Math.round(event.durationMs),
            errorMessage: event.error instanceof Error ? event.error.message : "Unknown error",
          });
        },
      }),
    [activeAccountId, commandContext.view.scope, commandRegistry, selectedThreadIds.length],
  );

  const availableCommands = useMemo(
    () => commandRegistry.listAvailable(commandContext),
    [commandContext, commandRegistry],
  );

  const runCommand = async (commandId: string, input?: unknown) => {
    const startedAt = performance.now();
    let resolvedInput = input;
    const command = commandRegistry.getById(commandId);

    if (
      command?.input.type === "picker" &&
      input &&
      typeof input === "object" &&
      "pickerItemId" in input
    ) {
      const source = pickerRegistry.getById(command.input.source);
      const pickerItemId = String((input as { pickerItemId: string }).pickerItemId);
      resolvedInput = source.resolve
        ? await source.resolve(commandContext, pickerItemId)
        : { id: pickerItemId };
    }

    const result = await executor.run(commandId, commandContext, resolvedInput);
    void recordPerfEvent({
      accountId: activeAccountId,
      route: commandContext.view.route,
      metric: "command_latency_ms",
      valueMs: performance.now() - startedAt,
      metadata: {
        commandId,
        status: result.status,
      },
    });
    if (result.status === "error") {
      setErrorMessage(result.message);
      return;
    }

    setStatusMessage(result.status === "queued" ? `Queued: ${commandId}` : `Done: ${commandId}`);
    setErrorMessage(null);
  };

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if (paletteOpen) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isEditable) {
        return;
      }

      const { command, consumed } = keybindingManagerRef.current.resolve(
        event,
        commandContext,
        commandRegistry,
      );

      if (!consumed) {
        return;
      }

      event.preventDefault();
      if (!command) {
        return;
      }

      await runCommand(command.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      keybindingManagerRef.current.clear();
    };
  }, [commandContext, commandRegistry, paletteOpen]);

  const onPaletteResolveItems = async (commandId: string, query: string) => {
    const command = commandRegistry.getById(commandId);
    if (!command || command.input.type !== "picker") {
      return [];
    }

    const source = pickerRegistry.getById(command.input.source);
    const items = await source.getItems(commandContext, query);

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
    }));
  };

  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? null;

  const labelFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of visibleThreads) {
      for (const labelId of thread.providerLabelIds) {
        counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
      }
    }
    return counts;
  }, [visibleThreads]);

  const rowHeight = settings.density === "compact" ? 72 : 88;
  const overscan = 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    visibleThreads.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );
  const virtualThreads = visibleThreads.slice(startIndex, endIndex);
  const topSpacer = startIndex * rowHeight;
  const bottomSpacer = (visibleThreads.length - endIndex) * rowHeight;

  return (
    <div
      className={cn(
        "grid min-h-dvh grid-rows-[auto,1fr]",
        settings.contrast === "high" ? "envelope-contrast-high" : "",
        isLight ? "bg-stone-100 text-stone-900" : "bg-stone-950 text-stone-100",
      )}
    >
      <header
        className={cn(
          "z-nav border-b px-4 py-3",
          isLight ? "border-stone-300 bg-stone-50/95" : "border-stone-800 bg-stone-900/95",
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div>
            <p className={cn("text-xs uppercase", isLight ? "text-stone-500" : "text-stone-500")}>Envelope</p>
            <h1 className="text-2xl font-semibold text-balance">Inbox</h1>
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="search-inbox">
              Search inbox
            </label>
            <input
              id="search-inbox"
              ref={searchRef}
              placeholder="Search subject/snippet"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={cn(
                "w-56 rounded-lg border px-2 py-1.5 text-sm",
                isLight
                  ? "border-stone-300 bg-white text-stone-900"
                  : "border-stone-700 bg-stone-950 text-stone-100",
              )}
            />

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
              className={cn(
                "rounded-lg border px-2 py-1.5 text-sm",
                isLight
                  ? "border-stone-300 bg-white text-stone-900"
                  : "border-stone-700 bg-stone-950 text-stone-100",
              )}
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
                void updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" });
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              {settings.theme === "dark" ? "Light" : "Dark"}
            </button>

            <button
              type="button"
              onClick={() => {
                void updateSettings({
                  density: settings.density === "comfortable" ? "compact" : "comfortable",
                });
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              {settings.density === "comfortable" ? "Compact" : "Comfortable"}
            </button>

            <button
              type="button"
              onClick={() => {
                void updateSettings({ keymap: settings.keymap === "superhuman" ? "vim" : "superhuman" });
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              {settings.keymap === "superhuman" ? "Vim" : "Superhuman"}
            </button>

            <button
              type="button"
              onClick={() => {
                void updateSettings({ contrast: settings.contrast === "high" ? "standard" : "high" });
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              {settings.contrast === "high" ? "Standard Contrast" : "High Contrast"}
            </button>

            <button
              type="button"
              onClick={() => {
                void updateSettings({ hideRareLabels: !settings.hideRareLabels });
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              {settings.hideRareLabels ? "Show Rare Labels" : "Hide Rare Labels"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeAccountId) {
                  window.location.href = `/compose?accountId=${activeAccountId}`;
                  return;
                }
                window.location.href = "/compose";
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              Compose
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/diagnostics";
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              Diagnostics
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/settings";
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs uppercase",
                isLight ? "border-stone-300" : "border-stone-700",
              )}
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4">
        {activeAccount?.status === "needs_reauth" ? (
          <div className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 text-pretty">
            Account requires reauthentication. Open diagnostics to reconnect.
          </div>
        ) : null}

        {syncProgress?.inProgress ? (
          <div className="mb-3 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
            <p>
              Syncing {prettySyncPhase(syncProgress.phase)}: {syncProgress.processed}
              {syncProgress.target ? ` / ${syncProgress.target}` : ""}
            </p>
            <p className="mt-1 text-xs text-blue-200/80">
              Threads appear in the inbox as they arrive. You can keep using the app while sync
              continues in the background.
            </p>
            {syncLooksStale ? (
              <p className="mt-1 text-xs text-amber-200">
                No sync update for over a minute. Open diagnostics to inspect the queue or retry the
                account sync.
              </p>
            ) : null}
          </div>
        ) : null}

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

        <div
          className={cn(
            "rounded-2xl border",
            isLight ? "border-stone-300 bg-white" : "border-stone-800 bg-stone-900/80",
          )}
        >
          {visibleThreads.length === 0 ? (
            <div className={cn("px-4 py-12 text-center text-pretty", isLight ? "text-stone-500" : "text-stone-400")}>
              <p className="text-lg text-balance">No threads yet</p>
              <p className="mt-1 text-sm">
                {searchQuery.trim()
                  ? "No threads match your search."
                  : syncProgress?.inProgress
                    ? "Initial sync is running. Threads will appear here in batches as they are ingested."
                    : "Connect Gmail and run initial sync from settings."}
              </p>
            </div>
          ) : (
            <div
              ref={listRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              className="h-[calc(100dvh-15rem)] overflow-y-auto"
            >
              <ul role="listbox" aria-label="Thread list">
                {topSpacer > 0 ? <li style={{ height: topSpacer }} aria-hidden /> : null}

                {virtualThreads.map((thread) => {
                  const selected = selectedThreadIds.includes(thread.id);
                  const labels = thread.providerLabelIds
                    .filter((labelId) => {
                      if (isSystemLabel(labelId)) {
                        return true;
                      }
                      if (!settings.hideRareLabels) {
                        return true;
                      }
                      return (labelFrequency.get(labelId) ?? 0) >= 2;
                    })
                    .slice(0, 4);

                  return (
                    <li key={thread.id} aria-selected={selected} style={{ height: rowHeight }}>
                      <button
                        type="button"
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey) {
                            setSelectedThreadIds((current) => {
                              if (current.includes(thread.id)) {
                                return current.filter((id) => id !== thread.id);
                              }
                              return [...current, thread.id];
                            });
                            return;
                          }

                          setSelectedThreadIds([thread.id]);
                          if (activeAccountId) {
                            window.location.href = `/thread/${thread.id}?accountId=${activeAccountId}`;
                          }
                        }}
                        className={cn(
                          "grid h-full w-full grid-cols-[auto,1fr,auto] items-center gap-3 px-4 text-left",
                          selected
                            ? "bg-amber-500/15"
                            : isLight
                              ? "hover:bg-stone-100"
                              : "hover:bg-stone-800",
                          settings.density === "compact" ? "py-2" : "py-3",
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            thread.unreadCount > 0
                              ? "bg-amber-400"
                              : isLight
                                ? "bg-stone-300"
                                : "bg-stone-700",
                          )}
                        />
                        <span>
                          <span className="block truncate text-sm font-medium">{thread.subject}</span>
                          <span className={cn("block truncate text-xs", isLight ? "text-stone-600" : "text-stone-400")}>
                            {thread.snippet}
                          </span>
                          {labels.length > 0 ? (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {labels.map((labelId) => (
                                <span
                                  key={`${thread.id}-${labelId}`}
                                  className={cn(
                                    "rounded border px-1.5 py-0.5 text-[10px] uppercase",
                                    isLight
                                      ? "border-stone-300 bg-stone-100 text-stone-700"
                                      : "border-stone-700 bg-stone-800 text-stone-300",
                                  )}
                                >
                                  {prettyLabel(labelId)}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <span className={cn("text-xs tabular-nums", isLight ? "text-stone-500" : "text-stone-400")}>
                          {new Date(thread.lastMessageAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </button>
                    </li>
                  );
                })}

                {bottomSpacer > 0 ? <li style={{ height: bottomSpacer }} aria-hidden /> : null}
              </ul>
            </div>
          )}
        </div>
      </main>

      <CommandPalette
        commands={availableCommands.map((command) => ({
          id: command.id,
          title: command.presentation.title,
          subtitle: command.presentation.subtitle,
          category: command.presentation.category,
          inputType: command.input.type === "picker" ? "picker" : "none",
        }))}
        onOpenChange={setPaletteOpen}
        onExecute={runCommand}
        onResolvePickerItems={onPaletteResolveItems}
      />

      <div
        className={cn(
          "fixed bottom-3 right-3 rounded-lg border px-3 py-2 text-xs",
          isLight
            ? "border-stone-300 bg-white text-stone-600"
            : "border-stone-700 bg-stone-900 text-stone-400",
        )}
      >
        <p>
          <kbd className={cn("rounded px-1.5 py-0.5 font-mono", isLight ? "bg-stone-100" : "bg-stone-800")}>Cmd</kbd>
          +
          <kbd className={cn("rounded px-1.5 py-0.5 font-mono", isLight ? "bg-stone-100" : "bg-stone-800")}>K</kbd>{" "}
          for commands
        </p>
        <p className="mt-1">Selected: {selectedThreadIds.length}</p>
      </div>
    </div>
  );
}
