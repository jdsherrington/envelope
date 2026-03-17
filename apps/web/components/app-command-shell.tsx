"use client";

import {
  CommandExecutor,
  CommandRegistry,
  type CommandContext,
  type CommandViewScope,
  type UserSettings,
} from "@envelope/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { recordPerfEvent } from "@/lib/client/perf";
import { useDocumentTheme } from "@/lib/client/theme";
import { KeybindingManager } from "@/lib/client/commands/keybinding-manager";
import { createPickerSourceRegistry } from "@/lib/client/commands/picker-sources";
import { buildComposeCommands } from "@/lib/client/commands/scopes/compose-commands";
import { buildDiagnosticsCommands } from "@/lib/client/commands/scopes/diagnostics-commands";
import { buildNavigationCommands } from "@/lib/client/commands/scopes/navigation-commands";
import { buildSettingsCommands } from "@/lib/client/commands/scopes/settings-commands";
import { buildThreadCommands } from "@/lib/client/commands/scopes/thread-commands";

type ThreadCommandContext = {
  threadId: string;
  messageId: string | null;
};

type AppCommandShellProps = {
  userId: string;
  scope: Exclude<CommandViewScope, "global" | "inbox">;
  route: string;
  initialSettings: UserSettings;
  activeAccountId?: string | null;
  selectedThreadIds?: string[] | null;
  messageId?: string | null;
  threadContext?: ThreadCommandContext;
};

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
    // Diagnostics failures should not break command execution.
  }
};

export function AppCommandShell({
  userId,
  scope,
  route,
  initialSettings,
  activeAccountId = null,
  selectedThreadIds = null,
  messageId = null,
  threadContext,
}: AppCommandShellProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const keybindingManagerRef = useRef(new KeybindingManager());

  useDocumentTheme(settings.theme, settings.accent);

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

  const commandContext = useMemo<CommandContext>(
    () => ({
      userId,
      activeAccountId,
      view: {
        scope,
        route,
      },
      selection: {
        threadIds: selectedThreadIds ?? [],
        messageId,
      },
      capabilities: {
        provider: "gmail",
        supportsSendLater: true,
        supportsSnooze: true,
        supportsUndoSend: true,
      },
      ui: {
        density: settings.density,
        theme: settings.theme,
        keymap: settings.keymap,
        accent: settings.accent,
        hideRareLabels: settings.hideRareLabels,
        paletteOpen,
      },
    }),
    [activeAccountId, messageId, paletteOpen, route, scope, selectedThreadIds, settings, userId],
  );

  const pickerRegistry = useMemo(
    () =>
      createPickerSourceRegistry({
        getAccounts: () => [],
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
        fetchFailedJobs: async () => {
          const response = await fetch("/api/diagnostics");
          if (!response.ok) {
            return [];
          }
          const payload = (await response.json()) as {
            jobs: Array<{
              id: string;
              type: string;
              status: "failed" | "dead" | "pending" | "running" | "succeeded";
              accountId: string;
            }>;
          };
          return payload.jobs
            .filter((job) => job.status === "failed" || job.status === "dead")
            .map((job) => ({
              id: job.id,
              type: job.type,
              accountId: job.accountId,
            }));
        },
      }),
    [],
  );

  const commandRegistry = useMemo(() => {
    const registry = new CommandRegistry();
    const navigate = (href: string) => {
      window.location.href = href;
    };

    registry.registerMany(buildNavigationCommands({ navigate }));
    registry.registerMany(
      buildSettingsCommands({
        updateSettings,
      }),
    );
    registry.registerMany(
      buildDiagnosticsCommands({
        navigate,
        exportDiagnostics: () => {
          window.location.href = "/api/diagnostics/export";
        },
        retryFailedJob: async (jobId: string, accountId: string) => {
          await jsonPost(`/api/diagnostics/jobs/${jobId}/retry`, { accountId });
        },
      }),
    );

    if (scope === "thread") {
      registry.registerMany(
        buildThreadCommands({
          openCompose: (mode) => {
            if (!activeAccountId) {
              navigate("/compose");
              return;
            }

            const params = new URLSearchParams();
            params.set("accountId", activeAccountId);
            if (mode !== "new") {
              params.set("mode", mode);
            }
            if (threadContext?.threadId) {
              params.set("threadId", threadContext.threadId);
            }
            if (mode !== "new" && threadContext?.messageId) {
              params.set("messageId", threadContext.messageId);
            }
            navigate(`/compose?${params.toString()}`);
          },
        }),
      );
    }

    if (scope === "compose") {
      registry.registerMany(
        buildComposeCommands({
          send: () => {
            window.dispatchEvent(new CustomEvent("envelope:compose:send"));
          },
          saveDraft: () => {
            window.dispatchEvent(new CustomEvent("envelope:compose:save-draft"));
          },
          sendLater: (sendAt) => {
            window.dispatchEvent(new CustomEvent("envelope:compose:send-later", { detail: { sendAt } }));
          },
          undoSend: () => {
            window.dispatchEvent(new CustomEvent("envelope:compose:undo-send"));
          },
          insertSnippet: (body) => {
            window.dispatchEvent(new CustomEvent("envelope:compose:insert-snippet", { detail: { body } }));
          },
          insertTemplate: (body) => {
            window.dispatchEvent(new CustomEvent("envelope:compose:insert-template", { detail: { body } }));
          },
        }),
      );
    }

    return registry;
  }, [activeAccountId, scope, threadContext, updateSettings]);

  const executor = useMemo(
    () =>
      new CommandExecutor(commandRegistry, {
        onSucceeded: (event) => {
          const selectionCount = commandContext.selection.threadIds.length;
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
            selectionCount: commandContext.selection.threadIds.length,
            status: "error",
            durationMs: Math.round(event.durationMs),
            errorMessage: event.error instanceof Error ? event.error.message : "Unknown error",
          });
        },
      }),
    [activeAccountId, commandContext, commandRegistry],
  );

  const availableCommands = useMemo(
    () => commandRegistry.listAvailable(commandContext),
    [commandContext, commandRegistry],
  );

  const runCommand = useCallback(
    async (commandId: string, input?: unknown) => {
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
        setStatusMessage(null);
        return;
      }

      setStatusMessage(result.status === "queued" ? `Queued: ${commandId}` : `Done: ${commandId}`);
      setErrorMessage(null);
    },
    [activeAccountId, commandContext, commandRegistry, executor, pickerRegistry],
  );

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if (paletteOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      // Keep compose shortcuts available with modifiers while typing.
      if (isEditable && (scope !== "compose" || (!event.metaKey && !event.ctrlKey))) {
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
  }, [commandContext, commandRegistry, paletteOpen, runCommand, scope]);

  const onPaletteResolveItems = useCallback(
    async (commandId: string, query: string) => {
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
    },
    [commandContext, commandRegistry, pickerRegistry],
  );

  return (
    <>
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

      {(statusMessage || errorMessage) && (
        <div className="envelope-panel-strong fixed bottom-3 left-3 z-nav max-w-[28rem] rounded-lg px-3 py-2 text-xs">
          {errorMessage ? <p className="text-[var(--color-danger-fg)]">{errorMessage}</p> : null}
          {statusMessage ? <p className="text-[var(--color-success-fg)]">{statusMessage}</p> : null}
        </div>
      )}
    </>
  );
}
