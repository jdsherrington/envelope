"use client";

import Link from "next/link";
import type { Route } from "next";
import { CommandExecutor, CommandRegistry, type CommandContext } from "@envelope/core";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { CommandPalette } from "@/components/command-palette";
import { InboxPreviewPane, warmThreadPreview } from "@/components/inbox-preview-pane";
import { SettingsDialog } from "@/components/settings-dialog";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { cn } from "@/lib/client/cn";
import { formatInboxTimestamp, formatStableInboxTimestamp, useHydrated } from "@/lib/client/date-time";
import { recordPerfEvent } from "@/lib/client/perf";
import { useDocumentTheme } from "@/lib/client/theme";
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
  senderName: string | null;
  senderEmail: string | null;
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
  initialThreadId: string | null;
  initialSettings: UserSettings;
  accounts: InboxAccount[];
  initialThreads: InboxThread[];
};

type RailLinkProps = {
  active?: boolean;
  ariaLabel: string;
  label: string;
  href: Route;
  expanded: boolean;
  children: ReactNode;
};

type InboxNotification = {
  tone: "success" | "danger";
  message: string;
  ariaRole: "status" | "alert";
  ariaLive: "polite" | "assertive";
};

const PREVIEW_PANE_WIDTH_STORAGE_KEY = "envelope.inbox.preview-pane-width";
const PREVIEW_PANE_DEFAULT_WIDTH = 420;
const PREVIEW_PANE_MIN_WIDTH = 320;
const PREVIEW_PANE_MAX_WIDTH = 860;
const PREVIEW_PANE_KEYBOARD_STEP = 24;
const SHELL_RAIL_WIDTH_PX = 76;
const SHELL_GAP_PX = 12;
const SHELL_RESIZER_WIDTH_PX = 12;
const THREAD_LIST_MIN_WIDTH_PX = 520;

const clampNumber = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const readStoredPreviewPaneWidth = (): number => {
  if (typeof window === "undefined") {
    return PREVIEW_PANE_DEFAULT_WIDTH;
  }

  const stored = Number(window.localStorage.getItem(PREVIEW_PANE_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored)
    ? clampNumber(stored, PREVIEW_PANE_MIN_WIDTH, PREVIEW_PANE_MAX_WIDTH)
    : PREVIEW_PANE_DEFAULT_WIDTH;
};

const getMaxPreviewPaneWidth = (shellWidth: number): number => {
  if (shellWidth <= 0) {
    return PREVIEW_PANE_MAX_WIDTH;
  }

  const reservedWidth =
    SHELL_RAIL_WIDTH_PX + THREAD_LIST_MIN_WIDTH_PX + SHELL_RESIZER_WIDTH_PX + SHELL_GAP_PX * 3;
  return clampNumber(shellWidth - reservedWidth, PREVIEW_PANE_MIN_WIDTH, PREVIEW_PANE_MAX_WIDTH);
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

const prettySyncPhase = (phase: string | null | undefined): string => {
  if (!phase) {
    return "Inbox";
  }

  return phase
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/(^|\s)\w/g, (char) => char.toUpperCase());
};

const formatThreadSender = (thread: InboxThread): string => {
  if (thread.senderName?.trim()) {
    return thread.senderName;
  }

  if (!thread.senderEmail) {
    return "Unknown sender";
  }

  return thread.senderEmail.split("@")[0] ?? thread.senderEmail;
};

function RailLink({ active = false, ariaLabel, label, href, expanded, children }: RailLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={label}
      className={cn(
        "group/rail-link flex size-11 touch-manipulation items-center justify-center rounded-xl border p-0 transition-[width,background-color,border-color,color,box-shadow] duration-300 ease-out",
        active
          ? "envelope-button-accent shadow-[0_18px_40px_-26px_var(--color-accent)]"
          : "envelope-button-secondary hover:shadow-[0_16px_36px_-28px_oklch(0_0_0_/_0.7)]",
        expanded ? "xl:h-auto xl:w-full xl:justify-start xl:gap-3 xl:px-3 xl:py-2.5" : "xl:h-11 xl:w-11",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
          active
            ? "bg-[var(--color-accent-surface)] text-[var(--color-accent)]"
            : "text-[var(--color-text)] group-hover/rail-link:text-[var(--color-accent)]",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "hidden overflow-hidden whitespace-nowrap text-sm font-medium xl:block xl:transition-[max-width,opacity,transform] xl:duration-300 xl:ease-out",
          expanded ? "xl:max-w-[11rem] xl:translate-x-0 xl:opacity-100" : "xl:-translate-x-2 xl:max-w-0 xl:opacity-0",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

function EnvelopeMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 18.5 12 6l8 12.5" />
      <path d="M7 18.5 12 11l5 7.5" />
      <path d="M6 14.5h12" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7.5h16v9H4z" />
      <path d="M7.5 12h3l1.5 2h3L16.5 12h3" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 18.5h5.5L19 9l-4-4-9.5 9.5Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  );
}

function DiagnosticsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 18.5h14" />
      <path d="M7.5 15 10 12.5l2 2 4.5-5" />
      <path d="M7 6.5h10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
      <path d="M19 12a7 7 0 0 0-.08-1l2.08-1.62-2-3.46-2.54 1a7 7 0 0 0-1.72-1L14.4 3h-4.8l-.34 2.92a7 7 0 0 0-1.72 1l-2.54-1-2 3.46L5.08 11a7 7 0 0 0 0 2l-2.08 1.62 2 3.46 2.54-1a7 7 0 0 0 1.72 1L9.6 21h4.8l.34-2.92a7 7 0 0 0 1.72-1l2.54 1 2-3.46L18.92 13c.05-.33.08-.66.08-1Z" />
    </svg>
  );
}

function InlineNotification({
  notification,
  visible,
  onDismiss,
}: {
  notification: InboxNotification | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  if (!notification) {
    return null;
  }

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out",
        visible ? "max-h-48 opacity-100 translate-y-0" : "pointer-events-none max-h-0 opacity-0 translate-y-4",
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "envelope-inline-notification flex items-start gap-4 rounded-[1.25rem] px-5 py-4",
          notification.tone === "success"
            ? "envelope-inline-notification-success"
            : "envelope-inline-notification-danger",
        )}
        role={notification.ariaRole}
        aria-live={visible ? notification.ariaLive : "off"}
      >
        <div
          className={cn(
            "min-w-0 flex-1 transition-[opacity,transform] duration-200 ease-out",
            visible ? "translate-y-0 opacity-100 delay-100" : "translate-y-2 opacity-0",
          )}
        >
          <p className="text-sm font-medium tracking-[0.01em] text-pretty sm:text-[0.95rem]">
            {notification.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "envelope-inline-notification-dismiss rounded-full p-1.5 transition-[opacity,transform] duration-200 ease-out",
            visible ? "translate-y-0 opacity-100 delay-150" : "translate-y-2 opacity-0",
          )}
          aria-label="Dismiss notification"
        >
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m4 4 8 8" />
            <path d="m12 4-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function InboxApp({
  userId,
  initialAccountId,
  initialThreadId,
  initialSettings,
  accounts,
  initialThreads,
}: InboxAppProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeAccountId, setActiveAccountId] = useState<string | null>(initialAccountId);
  const [threads, setThreads] = useState(initialThreads);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [activePreviewThreadId, setActivePreviewThreadId] = useState<string | null>(
    initialThreadId ?? initialThreads[0]?.id ?? null,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderedNotification, setRenderedNotification] = useState<InboxNotification | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InboxThread[] | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const [shellWidth, setShellWidth] = useState(0);
  const [railExpanded, setRailExpanded] = useState(false);
  const [previewPanePreferredWidth, setPreviewPanePreferredWidth] = useState<number>(
    PREVIEW_PANE_DEFAULT_WIDTH,
  );

  const keybindingManagerRef = useRef(new KeybindingManager());
  const shellRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const initialThreadIdRef = useRef(initialThreadId);
  const previousAccountIdRef = useRef(initialAccountId);
  const lastSyncedInboxHrefRef = useRef<string | null>(null);
  const markReadRequestKeysRef = useRef(new Set<string>());
  const stopPreviewResizeRef = useRef<(() => void) | null>(null);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const activeSearchQuery = deferredSearchQuery.trim();
  const hydrated = useHydrated();
  const activeNotification = useMemo<InboxNotification | null>(() => {
    if (errorMessage) {
      return {
        tone: "danger",
        message: errorMessage,
        ariaRole: "alert",
        ariaLive: "assertive",
      };
    }

    if (statusMessage) {
      return {
        tone: "success",
        message: statusMessage,
        ariaRole: "status",
        ariaLive: "polite",
      };
    }

    return null;
  }, [errorMessage, statusMessage]);
  const activeNotificationKey = activeNotification
    ? `${activeNotification.tone}:${activeNotification.message}`
    : null;

  useDocumentTheme(settings.theme);

  useEffect(() => {
    const onSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserSettings>).detail;
      if (!detail) {
        return;
      }

      setSettings(detail);
    };

    window.addEventListener("envelope:settings:updated", onSettingsUpdated as EventListener);
    return () => {
      window.removeEventListener("envelope:settings:updated", onSettingsUpdated as EventListener);
    };
  }, []);

  const refreshInboxThreads = useCallback(async (accountId: string) => {
    try {
      const response = await fetch(`/api/inbox?accountId=${encodeURIComponent(accountId)}&page=1`);
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        items: InboxThread[];
      };

      setThreads(payload.items);
    } catch {
      // Ignore background refresh failures.
    }
  }, []);

  useEffect(() => {
    setActiveAccountId(initialAccountId);
    markReadRequestKeysRef.current.clear();
  }, [initialAccountId]);

  useEffect(() => {
    setPreviewPanePreferredWidth(readStoredPreviewPaneWidth());
  }, []);

  useEffect(() => {
    initialThreadIdRef.current = initialThreadId;
  }, [initialThreadId]);

  useEffect(() => {
    setThreads(initialThreads);

    const accountChanged = previousAccountIdRef.current !== activeAccountId;
    previousAccountIdRef.current = activeAccountId;

    const initialThreadIds = new Set(initialThreads.map((thread) => thread.id));

    if (accountChanged) {
      setSelectedThreadIds([]);
      setActivePreviewThreadId(() => {
        if (initialThreadId && initialThreadIds.has(initialThreadId)) {
          return initialThreadId;
        }

        return initialThreads[0]?.id ?? null;
      });
      return;
    }

    setSelectedThreadIds((current) => {
      if (!current.length) {
        return current;
      }

      const next = current.filter((threadId) => initialThreadIds.has(threadId));
      return next.length === current.length ? current : next;
    });

    setActivePreviewThreadId((current) => {
      if (current && initialThreadIds.has(current)) {
        return current;
      }

      if (initialThreadId && initialThreadIds.has(initialThreadId)) {
        return initialThreadId;
      }

      return initialThreads[0]?.id ?? null;
    });
  }, [activeAccountId, initialThreadId, initialThreads]);

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

          if (activeAccountId && !activeSearchQuery && (progress?.inProgress || progress?.processed)) {
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
  }, [activeAccountId, activeSearchQuery, refreshInboxThreads]);

  useEffect(() => {
    if (!activeSearchQuery || !activeAccountId) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/search?accountId=${encodeURIComponent(activeAccountId)}&q=${encodeURIComponent(activeSearchQuery)}&page=1`,
          );
          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as {
            items: InboxThread[];
          };

          if (!cancelled) {
            setSearchResults(payload.items);
          }
        } catch {
          // Ignore search failures.
        }
      })();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeAccountId, activeSearchQuery]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const update = () => {
      setShellWidth(shell.clientWidth);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);

    return () => {
      observer.disconnect();
    };
  }, []);

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

  useEffect(
    () => () => {
      stopPreviewResizeRef.current?.();
    },
    [],
  );

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
      setStatusMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to save settings");
    }
  }, []);

  useEffect(() => {
    let frameId = 0;

    if (activeNotification) {
      setNotificationVisible(false);
      setRenderedNotification(activeNotification);
      frameId = window.requestAnimationFrame(() => {
        setNotificationVisible(true);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    setNotificationVisible(false);
    return undefined;
  }, [activeNotification, activeNotificationKey]);

  useEffect(() => {
    if (activeNotification || notificationVisible || !renderedNotification) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRenderedNotification(null);
    }, 260);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeNotification, notificationVisible, renderedNotification]);

  const setUnreadCountForThreads = useCallback((threadIds: string[], unreadCount: number) => {
    const selected = new Set(threadIds);

    setThreads((previous) =>
      previous.map((thread) =>
        selected.has(thread.id)
          ? {
              ...thread,
              unreadCount,
            }
          : thread,
      ),
    );

    setSearchResults((previous) =>
      previous
        ? previous.map((thread) =>
            selected.has(thread.id)
              ? {
                  ...thread,
                  unreadCount,
                }
              : thread,
          )
        : previous,
    );
  }, []);

  const markThreadsRead = useCallback(
    async (accountId: string, threadIds: string[]) => {
      setUnreadCountForThreads(threadIds, 0);
      return jsonPost<{ jobId: string }>("/api/actions/mark-read", {
        accountId,
        threadIds,
      });
    },
    [setUnreadCountForThreads],
  );

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

  const visibleThreads = activeSearchQuery ? (searchResults ?? []) : threads;
  const currentUrlAccountId = searchParams.get("accountId");
  const currentUrlThreadId = searchParams.get("threadId");
  const currentUrlModal = searchParams.get("modal");
  const activeModal = currentUrlModal === "settings" ? "settings" : null;
  const settingsDialogOpen = activeModal === "settings";
  const syncProgressAgeMs = syncProgress?.updatedAt
    ? Date.now() - new Date(syncProgress.updatedAt).getTime()
    : null;
  const syncLooksStale = Boolean(
    syncProgress?.inProgress && syncProgressAgeMs != null && syncProgressAgeMs > 60_000,
  );
  const buildInboxHref = useCallback(
    (accountId: string | null, threadId?: string | null, modal?: "settings" | null): Route => {
      const params = new URLSearchParams();

      if (accountId) {
        params.set("accountId", accountId);
      }

      if (threadId) {
        params.set("threadId", threadId);
      }

      if (modal) {
        params.set("modal", modal);
      }

      const query = params.toString();
      return (query ? `/inbox?${query}` : "/inbox") as Route;
    },
    [],
  );

  useEffect(() => {
    if (!visibleThreads.length) {
      setSelectedThreadIds([]);
      setActivePreviewThreadId(null);
      return;
    }

    const visibleIds = new Set(visibleThreads.map((thread) => thread.id));

    setSelectedThreadIds((current) => {
      if (!current.length) {
        return current;
      }

      const next = current.filter((threadId) => visibleIds.has(threadId));
      return next.length === current.length ? current : next;
    });

    setActivePreviewThreadId((current) => {
      if (currentUrlThreadId && visibleIds.has(currentUrlThreadId)) {
        return currentUrlThreadId;
      }

      if (current && visibleIds.has(current)) {
        return current;
      }

      const initialThreadCandidate = initialThreadIdRef.current;
      if (initialThreadCandidate && visibleIds.has(initialThreadCandidate)) {
        initialThreadIdRef.current = null;
        return initialThreadCandidate;
      }

      return visibleThreads[0]?.id ?? null;
    });
  }, [currentUrlThreadId, visibleThreads]);

  useEffect(() => {
    setScrollTop(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [activeSearchQuery, activeAccountId]);

  const openThread = useCallback(
    (threadId: string, accountId: string) => {
      router.push(`/thread/${threadId}?accountId=${accountId}` as Route);
    },
    [router],
  );

  const navigate = useCallback(
    (href: string) => {
      if (href.startsWith("/api/")) {
        window.location.href = href;
        return;
      }

      router.push(href as Route);
    },
    [router],
  );

  const openSettingsDialog = useCallback(() => {
    navigate(buildInboxHref(activeAccountId, activePreviewThreadId, "settings"));
  }, [activeAccountId, activePreviewThreadId, buildInboxHref, navigate]);

  const closeSettingsDialog = useCallback(() => {
    const nextHref = buildInboxHref(activeAccountId, activePreviewThreadId, null);
    lastSyncedInboxHrefRef.current = nextHref;
    router.replace(nextHref, { scroll: false });
  }, [activeAccountId, activePreviewThreadId, buildInboxHref, router]);

  useEffect(() => {
    if (!activeAccountId) {
      return;
    }

    const selectedThreadId = activePreviewThreadId;

    // Wait for the selection effect to settle before mirroring it into the URL.
    if (!selectedThreadId && visibleThreads.length > 0) {
      return;
    }

    if (
      currentUrlAccountId === activeAccountId &&
      (currentUrlThreadId ?? null) === selectedThreadId &&
      activeModal === currentUrlModal
    ) {
      lastSyncedInboxHrefRef.current = buildInboxHref(activeAccountId, selectedThreadId, activeModal);
      return;
    }

    const nextHref = buildInboxHref(activeAccountId, selectedThreadId, activeModal);
    if (lastSyncedInboxHrefRef.current === nextHref) {
      return;
    }

    lastSyncedInboxHrefRef.current = nextHref;
    router.replace(nextHref, { scroll: false });
  }, [
    activeAccountId,
    activeModal,
    buildInboxHref,
    currentUrlAccountId,
    currentUrlModal,
    currentUrlThreadId,
    router,
    activePreviewThreadId,
    visibleThreads.length,
  ]);

  useEffect(() => {
    if (!activeAccountId || !visibleThreads.length) {
      return;
    }

    const selectedIndex = visibleThreads.findIndex((thread) => thread.id === activePreviewThreadId);
    const targetIndexes =
      selectedIndex >= 0
        ? [selectedIndex - 1, selectedIndex, selectedIndex + 1, selectedIndex + 2]
        : [0, 1, 2];

    for (const index of targetIndexes) {
      const thread = visibleThreads[index];
      if (!thread) {
        continue;
      }

      warmThreadPreview(activeAccountId, thread.id);
      void router.prefetch(`/thread/${thread.id}?accountId=${activeAccountId}` as Route);
    }
  }, [activeAccountId, activePreviewThreadId, router, visibleThreads]);

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
      openSettings: () => {
        openSettingsDialog();
      },
      openThread,
      navigate,
      switchAccount: (accountId: string) => {
        setActiveAccountId(accountId);
        router.push(buildInboxHref(accountId));
      },
      selectNextThread: () => {
        if (!visibleThreads.length) {
          return;
        }

        const currentId = activePreviewThreadId;
        if (!currentId) {
          setActivePreviewThreadId(visibleThreads[0]?.id ?? null);
          return;
        }

        const index = visibleThreads.findIndex((thread) => thread.id === currentId);
        const nextIndex = Math.min(index + 1, visibleThreads.length - 1);
        const nextId = visibleThreads[nextIndex]?.id;
        if (nextId) {
          setActivePreviewThreadId(nextId);
        }
      },
      selectPreviousThread: () => {
        if (!visibleThreads.length) {
          return;
        }

        const currentId = activePreviewThreadId;
        if (!currentId) {
          setActivePreviewThreadId(visibleThreads[0]?.id ?? null);
          return;
        }

        const index = visibleThreads.findIndex((thread) => thread.id === currentId);
        const nextIndex = Math.max(index - 1, 0);
        const nextId = visibleThreads[nextIndex]?.id;
        if (nextId) {
          setActivePreviewThreadId(nextId);
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
      markRead: markThreadsRead,
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
        setSearchResults((previous) =>
          previous
            ? previous.map((thread) =>
                selected.has(thread.id)
                  ? {
                      ...thread,
                      unreadCount: Math.max(thread.unreadCount, 1),
                    }
                  : thread,
              )
            : previous,
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
  }, [activePreviewThreadId, buildInboxHref, navigate, openSettingsDialog, openThread, router, updateSettings, visibleThreads]);

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
      setStatusMessage(null);
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
  const activePreviewThread = visibleThreads.find((thread) => thread.id === activePreviewThreadId) ?? null;
  const dismissNotification = useCallback(() => {
    setNotificationVisible(false);
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!activeAccountId || !activePreviewThread || activePreviewThread.unreadCount < 1) {
      return;
    }

    const requestKey = `${activeAccountId}:${activePreviewThread.id}`;
    if (markReadRequestKeysRef.current.has(requestKey)) {
      return;
    }

    markReadRequestKeysRef.current.add(requestKey);

    void markThreadsRead(activeAccountId, [activePreviewThread.id])
      .catch(() => {
        void refreshInboxThreads(activeAccountId);
      })
      .finally(() => {
        markReadRequestKeysRef.current.delete(requestKey);
      });
  }, [activeAccountId, activePreviewThread, markThreadsRead, refreshInboxThreads]);

  const maxPreviewPaneWidth = getMaxPreviewPaneWidth(shellWidth);
  const previewPaneWidth = clampNumber(
    previewPanePreferredWidth,
    PREVIEW_PANE_MIN_WIDTH,
    maxPreviewPaneWidth,
  );
  const previewPaneStyle = useMemo(
    () =>
      ({
        "--preview-pane-width": `${previewPaneWidth}px`,
      }) as CSSProperties,
    [previewPaneWidth],
  );

  const rowHeight = settings.density === "compact" ? 64 : 78;
  const overscan = 8;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    visibleThreads.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );
  const virtualThreads = visibleThreads.slice(startIndex, endIndex);
  const topSpacer = startIndex * rowHeight;
  const bottomSpacer = (visibleThreads.length - endIndex) * rowHeight;

  const toggleThreadSelection = (threadId: string) => {
    setSelectedThreadIds((current) =>
      current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [...current, threadId],
    );
  };

  const commitPreviewPaneWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampNumber(nextWidth, PREVIEW_PANE_MIN_WIDTH, maxPreviewPaneWidth);
    setPreviewPanePreferredWidth(clampedWidth);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREVIEW_PANE_WIDTH_STORAGE_KEY, String(Math.round(clampedWidth)));
    }
  }, [maxPreviewPaneWidth]);

  const updatePreviewPaneWidthFromPointer = useCallback((clientX: number) => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const bounds = shell.getBoundingClientRect();
    commitPreviewPaneWidth(bounds.right - clientX);
  }, [commitPreviewPaneWidth]);

  const handlePreviewResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const onMove = (pointerEvent: PointerEvent) => {
        updatePreviewPaneWidthFromPointer(pointerEvent.clientX);
      };

      const stop = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        stopPreviewResizeRef.current = null;
      };

      stopPreviewResizeRef.current?.();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
      stopPreviewResizeRef.current = stop;

      updatePreviewPaneWidthFromPointer(event.clientX);
    },
    [updatePreviewPaneWidthFromPointer],
  );

  const handlePreviewResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitPreviewPaneWidth(previewPaneWidth + PREVIEW_PANE_KEYBOARD_STEP);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        commitPreviewPaneWidth(previewPaneWidth - PREVIEW_PANE_KEYBOARD_STEP);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        commitPreviewPaneWidth(PREVIEW_PANE_MIN_WIDTH);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        commitPreviewPaneWidth(maxPreviewPaneWidth);
      }
    },
    [commitPreviewPaneWidth, maxPreviewPaneWidth, previewPaneWidth],
  );

  const handleRailBlurCapture = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setRailExpanded(false);
  }, []);

  const railHeaderRevealClassName = cn(
    "hidden overflow-hidden xl:block xl:transition-[max-width,opacity,transform] xl:duration-300 xl:ease-out",
    railExpanded ? "xl:max-w-[9.5rem] xl:translate-x-0 xl:opacity-100" : "xl:-translate-x-2 xl:max-w-0 xl:opacity-0",
  );
  const railDetailRevealClassName = cn(
    "overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out",
    railExpanded ? "max-h-40 translate-y-0 opacity-100" : "max-h-0 translate-y-3 opacity-0",
  );

  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden px-3 py-3 lg:px-4 lg:py-4",
        settings.contrast === "high" ? "envelope-contrast-high" : "",
      )}
    >
      <a
        href="#inbox-main"
        className="envelope-button-secondary sr-only absolute left-4 top-4 z-nav rounded-lg px-3 py-2 text-sm font-medium focus:not-sr-only"
      >
        Skip to Inbox
      </a>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {activeAccount?.status === "needs_reauth" ? (
          <div
            className="envelope-status-warning rounded-lg px-4 py-3 text-sm text-pretty"
            role="status"
            aria-live="polite"
          >
            Account requires reauthentication. Open diagnostics to reconnect this inbox.
          </div>
        ) : null}

        <div ref={shellRef} className="relative isolate flex min-h-0 flex-1 flex-col gap-3 xl:flex-row xl:gap-0">
          <div
            aria-hidden="true"
            className={cn(
              "envelope-rail-veil pointer-events-none absolute inset-0 z-base hidden rounded-[1.75rem] transition-opacity duration-300 xl:block",
              railExpanded ? "opacity-100" : "opacity-0",
            )}
          />

          <aside
            className="relative flex flex-none xl:mr-3 xl:h-full xl:w-[4.75rem]"
            onMouseEnter={() => setRailExpanded(true)}
            onMouseLeave={() => setRailExpanded(false)}
            onFocusCapture={() => setRailExpanded(true)}
            onBlurCapture={handleRailBlurCapture}
          >
            <div
              className={cn(
                "envelope-rail z-nav flex w-full rounded-[1.25rem] p-3 transition-[width,box-shadow,background-color] duration-300 ease-out xl:absolute xl:inset-y-0 xl:left-0 xl:w-[4.75rem] xl:flex-col xl:justify-between xl:overflow-hidden",
                railExpanded ? "xl:w-[18rem] xl:shadow-[0_34px_90px_-42px_oklch(0_0_0_/_0.95)]" : "xl:shadow-none",
              )}
            >
              <div className="flex items-center gap-3 xl:flex-col xl:items-stretch">
                <div className="flex items-center gap-3">
                  <div className="envelope-brand-mark flex size-12 shrink-0 items-center justify-center rounded-xl">
                    <EnvelopeMark />
                  </div>
                  <div className={railHeaderRevealClassName}>
                    <p className="text-sm font-semibold tracking-[0.01em]">Envelope</p>
                    <p className="envelope-text-soft mt-0.5 text-xs">Mail cockpit</p>
                  </div>
                </div>

                <nav aria-label="Primary" className="flex gap-2 xl:mt-4 xl:flex-col">
                  <RailLink
                    active
                    ariaLabel="Open inbox"
                    label="Inbox"
                    expanded={railExpanded}
                    href={buildInboxHref(activeAccountId)}
                  >
                    <InboxIcon />
                  </RailLink>
                  <RailLink
                    ariaLabel="Compose message"
                    label="Compose"
                    expanded={railExpanded}
                    href={(activeAccountId ? `/compose?accountId=${activeAccountId}` : "/compose") as Route}
                  >
                    <ComposeIcon />
                  </RailLink>
                  <RailLink
                    ariaLabel="Open diagnostics"
                    label="Diagnostics"
                    expanded={railExpanded}
                    href={"/diagnostics" as Route}
                  >
                    <DiagnosticsIcon />
                  </RailLink>
                  <RailLink
                    active={settingsDialogOpen}
                    ariaLabel="Open settings"
                    label="Settings"
                    expanded={railExpanded}
                    href={buildInboxHref(activeAccountId, activePreviewThreadId, "settings")}
                  >
                    <SettingsIcon />
                  </RailLink>
                </nav>
              </div>

              <div className="hidden xl:block">
                <div className={railDetailRevealClassName}>
                  <p className="envelope-text-muted truncate text-xs font-medium">
                    {activeAccount?.email ?? "No account"}
                  </p>
                  <p className="envelope-text-soft mt-1 text-[11px]">
                    {settings.keymap === "vim" ? "Vim" : "Superhuman"} keymap
                  </p>
                  <div className="envelope-panel-strong envelope-text-muted mt-3 rounded-xl px-3 py-2 text-xs">
                    <p>
                      <kbd className="envelope-kbd rounded-lg px-1.5 py-0.5 font-mono">Cmd</kbd>+
                      <kbd className="envelope-kbd ml-1 rounded-lg px-1.5 py-0.5 font-mono">K</kbd>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <main
            id="inbox-main"
            className="envelope-panel flex min-h-[30rem] min-w-0 flex-1 flex-col overflow-hidden rounded-lg xl:min-h-0"
          >
            <div className="envelope-panel-muted envelope-divider border-b px-4 pb-4 pt-5 lg:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="envelope-text-soft text-xs font-medium uppercase">
                    {activeAccount?.email ?? "Envelope"}
                  </p>
                  <h1 className="mt-2 text-[2rem] font-semibold leading-none text-balance">Inbox</h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="envelope-pill rounded-lg px-3 py-1 text-xs font-medium">
                    {activeSearchQuery ? `${visibleThreads.length} results` : `${visibleThreads.length} threads`}
                  </span>
                  <span className="envelope-pill rounded-lg px-3 py-1 text-xs font-medium">
                    {selectedThreadIds.length} selected
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div>
                  <label className="sr-only" htmlFor="search-inbox">
                    Search inbox
                  </label>
                  <input
                    id="search-inbox"
                    name="search"
                    ref={searchRef}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Search subject, snippet, or sender…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="envelope-input w-full rounded-lg px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="sr-only" htmlFor="active-account">
                    Active account
                  </label>
                  <select
                    id="active-account"
                    value={activeAccountId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setActiveAccountId(value || null);
                      navigate(buildInboxHref(value || null));
                    }}
                    className="envelope-input w-full rounded-lg px-4 py-3 text-sm"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.email} ({account.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {syncProgress?.inProgress ? (
                  <span
                    className="envelope-status-info rounded-lg px-3 py-1 text-xs font-medium"
                    role="status"
                    aria-live="polite"
                  >
                    Syncing {prettySyncPhase(syncProgress.phase)} {syncProgress.processed}
                    {syncProgress.target ? ` / ${syncProgress.target}` : ""}
                  </span>
                ) : null}
                {syncLooksStale ? (
                  <span className="envelope-status-warning rounded-lg px-3 py-1 text-xs font-medium">
                    Sync looks stale
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium",
                    activeAccount?.status === "ok"
                      ? "envelope-status-success"
                      : activeAccount?.status === "syncing"
                        ? "envelope-status-info"
                        : activeAccount?.status === "needs_reauth"
                          ? "envelope-status-warning"
                          : "envelope-pill",
                  )}
                >
                  {activeAccount?.status ?? "No account"}
                </span>
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="envelope-button-secondary rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                >
                  Command Palette
                </button>
              </div>
            </div>

            {visibleThreads.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
                <div className="envelope-text-muted max-w-md">
                  <p className="text-xl font-semibold text-balance text-[var(--color-text)] lg:text-2xl">
                    {activeSearchQuery ? "No threads match this search." : "No threads yet"}
                  </p>
                  <p className="mt-3 text-sm text-pretty">
                    {activeSearchQuery
                      ? "Try a sender name, a tighter phrase, or clear the search field to return to the full inbox."
                      : syncProgress?.inProgress
                        ? "Initial sync is running. Threads will appear here in batches as they land."
                        : "Connect Gmail and start a sync to populate the inbox."}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {activeSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="envelope-button-secondary rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      >
                        Clear Search
                      </button>
                    ) : (
                      <Link
                        href={"/diagnostics" as Route}
                        className="envelope-button-secondary rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                      >
                        Open Diagnostics
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={listRef}
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                className="flex-1 overflow-y-auto"
                aria-busy={syncProgress?.inProgress ? "true" : "false"}
              >
                <ul role="listbox" aria-label="Thread list">
                  {topSpacer > 0 ? <li style={{ height: topSpacer }} aria-hidden /> : null}

                  {virtualThreads.map((thread) => {
                    const checked = selectedThreadIds.includes(thread.id);
                    const previewed = activePreviewThreadId === thread.id;

                    return (
                      <li
                        key={thread.id}
                        aria-selected={previewed}
                        style={{ height: rowHeight }}
                        className="envelope-divider border-b"
                      >
                        <div
                          className={cn(
                            "relative grid h-full grid-cols-[auto,1fr] gap-3 px-4 lg:px-5",
                            previewed ? "envelope-row-selected" : "envelope-row-hover",
                          )}
                        >
                          {previewed ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-3 left-0 w-1 rounded-r-lg bg-[var(--color-accent)]"
                            />
                          ) : null}

                          <div className="flex items-center">
                            <label className="group/checkbox relative flex cursor-pointer items-center">
                              <input
                                type="checkbox"
                                aria-label={`Select ${thread.subject || "thread"}`}
                                checked={checked}
                                onChange={() => toggleThreadSelection(thread.id)}
                                className="peer sr-only"
                              />
                              <span
                                aria-hidden
                                className="flex size-4 items-center justify-center rounded-[2px] border border-[var(--color-border-strong)] bg-transparent text-[var(--color-accent-strong)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-focus)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--color-panel)] peer-checked:border-[var(--color-accent)] peer-checked:bg-[var(--color-accent-surface)] peer-checked:[&_svg]:opacity-100 group-hover/checkbox:border-[var(--color-text-soft)]"
                              >
                                <svg
                                  viewBox="0 0 16 16"
                                  className="size-3 opacity-0 transition-opacity"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  aria-hidden="true"
                                >
                                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                                </svg>
                              </span>
                            </label>
                          </div>

                          <button
                            type="button"
                            onMouseEnter={() => {
                              if (!activeAccountId) {
                                return;
                              }

                              warmThreadPreview(activeAccountId, thread.id);
                              void router.prefetch(`/thread/${thread.id}?accountId=${activeAccountId}` as Route);
                            }}
                            onFocus={() => {
                              if (!activeAccountId) {
                                return;
                              }

                              warmThreadPreview(activeAccountId, thread.id);
                              void router.prefetch(`/thread/${thread.id}?accountId=${activeAccountId}` as Route);
                            }}
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey) {
                                toggleThreadSelection(thread.id);
                                return;
                              }

                              setActivePreviewThreadId(thread.id);
                            }}
                            onDoubleClick={() => {
                              if (activeAccountId) {
                                openThread(thread.id, activeAccountId);
                              }
                            }}
                            className="min-w-0 touch-manipulation text-left"
                          >
                            <div className="flex h-full items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="md:grid md:grid-cols-[minmax(8.5rem,11rem)_minmax(0,1fr)] md:items-center md:gap-4">
                                  <p
                                    className={cn(
                                      "truncate text-sm",
                                      thread.unreadCount > 0 ? "font-semibold" : "font-medium",
                                    )}
                                  >
                                    {formatThreadSender(thread)}
                                  </p>
                                  <div className="mt-1 grid min-w-0 grid-cols-[fit-content(100%)_auto_minmax(0,1fr)] items-center gap-x-2 md:mt-0">
                                    <p
                                      className={cn(
                                        "min-w-0 truncate text-sm",
                                        thread.unreadCount > 0 ? "font-semibold" : "font-medium",
                                      )}
                                    >
                                      {thread.subject || "(No subject)"}
                                    </p>
                                    <span className="envelope-text-soft shrink-0 text-xs">
                                      -
                                    </span>
                                    <p className="envelope-text-muted min-w-0 truncate text-sm">
                                      {thread.snippet || "No preview available"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="ml-4 flex shrink-0 items-center gap-3 pl-2">
                                <span
                                  className={cn(
                                    "size-2 rounded-full",
                                    thread.unreadCount > 0
                                      ? "bg-[var(--color-accent)]"
                                      : "bg-[var(--color-border)]",
                                  )}
                                />
                                <time className="envelope-text-muted text-xs tabular-nums">
                                  {hydrated
                                    ? formatInboxTimestamp(thread.lastMessageAt)
                                    : formatStableInboxTimestamp(thread.lastMessageAt)}
                                </time>
                              </div>
                            </div>
                          </button>
                        </div>
                      </li>
                    );
                  })}

                  {bottomSpacer > 0 ? <li style={{ height: bottomSpacer }} aria-hidden /> : null}
                </ul>
              </div>
            )}
          </main>

          <div
            role="separator"
            aria-label="Resize preview pane"
            aria-controls="inbox-preview-pane"
            aria-orientation="vertical"
            aria-valuemin={PREVIEW_PANE_MIN_WIDTH}
            aria-valuemax={maxPreviewPaneWidth}
            aria-valuenow={previewPaneWidth}
            tabIndex={0}
            onDoubleClick={() => commitPreviewPaneWidth(PREVIEW_PANE_DEFAULT_WIDTH)}
            onPointerDown={handlePreviewResizeStart}
            onKeyDown={handlePreviewResizeKeyDown}
            className="hidden touch-none select-none outline-none xl:block xl:w-3 xl:flex-none xl:cursor-col-resize focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-0"
          />

          <div
            style={previewPaneStyle}
            className="flex w-full flex-none flex-col gap-3 xl:h-full xl:w-[var(--preview-pane-width)] xl:min-w-0"
          >
            <InboxPreviewPane
              id="inbox-preview-pane"
              className="w-full flex-1 min-h-[18rem] lg:min-h-0"
              accountId={activeAccountId}
              threadId={activePreviewThread?.id ?? null}
              summaryThread={activePreviewThread}
            />
            <InlineNotification
              notification={renderedNotification}
              visible={notificationVisible}
              onDismiss={dismissNotification}
            />
          </div>
        </div>
      </div>

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
      <SettingsDialog
        initial={settings}
        open={settingsDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            openSettingsDialog();
            return;
          }

          closeSettingsDialog();
        }}
      />
    </div>
  );
}
