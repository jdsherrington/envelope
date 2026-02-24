"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/client/cn";

type PaletteCommand = {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
};

type CommandPaletteProps = {
  commands: PaletteCommand[];
  onSelect: (commandId: string) => Promise<void> | void;
  onOpenChange?: (open: boolean) => void;
};

export function CommandPalette({ commands, onSelect, onOpenChange }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = `${command.title} ${command.subtitle ?? ""} ${command.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [onOpenChange, open]);

  const selectCommand = async (id: string) => {
    await onSelect(id);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-[20dvh] z-modal w-[min(720px,95vw)] -translate-x-1/2 rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-xl"
          aria-describedby="command-palette-description"
          onKeyDown={async (event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length,
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) =>
                filteredCommands.length === 0
                  ? 0
                  : (current - 1 + filteredCommands.length) % filteredCommands.length,
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const command = filteredCommands[activeIndex];
              if (command) {
                await selectCommand(command.id);
              }
            }
          }}
        >
          <Dialog.Title className="text-base font-medium text-stone-100 text-balance">
            Command Palette
          </Dialog.Title>
          <Dialog.Description
            id="command-palette-description"
            className="mt-1 text-sm text-stone-400 text-pretty"
          >
            Execute inbox and navigation commands quickly.
          </Dialog.Description>

          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Type a command"
            className="mt-4 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus-visible:border-amber-500"
            aria-label="Search commands"
          />

          <div className="mt-3 max-h-[50dvh] overflow-y-auto rounded-xl border border-stone-800 bg-stone-950/70">
            <p className="px-3 py-2 text-xs text-stone-500 tabular-nums" aria-live="polite">
              {filteredCommands.length} results
            </p>
            <ul role="listbox" aria-label="Command results" className="pb-2">
              {filteredCommands.map((command, index) => (
                <li key={command.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onClick={() => void selectCommand(command.id)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-3 py-2 text-left",
                      index === activeIndex
                        ? "bg-amber-500/20 text-amber-200"
                        : "text-stone-200 hover:bg-stone-800",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-medium text-balance">{command.title}</span>
                      {command.subtitle ? (
                        <span className="mt-0.5 block text-xs text-stone-400 text-pretty">
                          {command.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <span className="rounded-md border border-stone-700 px-2 py-0.5 text-[10px] uppercase text-stone-400">
                      {command.category}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
