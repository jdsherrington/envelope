"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/client/cn";

type PaletteCommand = {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  inputType: "none" | "picker";
};

type PalettePickerItem = {
  id: string;
  title: string;
  subtitle?: string;
};

type CommandPaletteProps = {
  commands: PaletteCommand[];
  onExecute: (commandId: string, input?: unknown) => Promise<void> | void;
  onResolvePickerItems?: (commandId: string, query: string) => Promise<PalettePickerItem[]>;
  onOpenChange?: (open: boolean) => void;
};

type PaletteStep =
  | { type: "commands" }
  | {
      type: "picker";
      commandId: string;
      commandTitle: string;
    };

export function CommandPalette({
  commands,
  onExecute,
  onResolvePickerItems,
  onOpenChange,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [step, setStep] = useState<PaletteStep>({ type: "commands" });
  const [pickerItems, setPickerItems] = useState<PalettePickerItem[]>([]);

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
    if (step.type !== "picker" || !onResolvePickerItems) {
      return;
    }

    let cancelled = false;
    void onResolvePickerItems(step.commandId, query).then((items) => {
      if (!cancelled) {
        setPickerItems(items);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onResolvePickerItems, query, step]);

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
      setStep({ type: "commands" });
      setPickerItems([]);
    }
  }, [onOpenChange, open]);

  const selectCommand = async (command: PaletteCommand) => {
    if (command.inputType === "picker") {
      setStep({ type: "picker", commandId: command.id, commandTitle: command.title });
      setQuery("");
      setActiveIndex(0);
      return;
    }

    await onExecute(command.id);
    setOpen(false);
  };

  const selectPickerItem = async (item: PalettePickerItem) => {
    if (step.type !== "picker") {
      return;
    }

    await onExecute(step.commandId, { pickerItemId: item.id });
    setOpen(false);
  };

  const currentResults = step.type === "commands" ? filteredCommands : pickerItems;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-[20dvh] z-modal w-[min(720px,95vw)] -translate-x-1/2 rounded-2xl border border-stone-700 bg-stone-900 p-4 shadow-xl"
          aria-describedby="command-palette-description"
          onKeyDown={async (event) => {
            if (event.key === "Escape" && step.type === "picker") {
              event.preventDefault();
              setStep({ type: "commands" });
              setQuery("");
              setActiveIndex(0);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                currentResults.length === 0 ? 0 : (current + 1) % currentResults.length,
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) =>
                currentResults.length === 0
                  ? 0
                  : (current - 1 + currentResults.length) % currentResults.length,
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (step.type === "commands") {
                const command = filteredCommands[activeIndex];
                if (command) {
                  await selectCommand(command);
                }
                return;
              }

              const item = pickerItems[activeIndex];
              if (item) {
                await selectPickerItem(item);
              }
            }
          }}
        >
          <Dialog.Title className="text-base font-medium text-stone-100 text-balance">
            {step.type === "commands" ? "Command Palette" : step.commandTitle}
          </Dialog.Title>
          <Dialog.Description
            id="command-palette-description"
            className="mt-1 text-sm text-stone-400 text-pretty"
          >
            {step.type === "commands"
              ? "Execute commands quickly across the app."
              : "Pick an option to complete this command."}
          </Dialog.Description>

          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={step.type === "commands" ? "Type a command" : "Type to filter"}
            className="mt-4 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus-visible:border-amber-500"
            aria-label={step.type === "commands" ? "Search commands" : "Search options"}
          />

          <div className="mt-3 max-h-[50dvh] overflow-y-auto rounded-xl border border-stone-800 bg-stone-950/70">
            <p className="px-3 py-2 text-xs text-stone-500 tabular-nums" aria-live="polite">
              {currentResults.length} results
            </p>
            <ul role="listbox" aria-label="Command results" className="pb-2">
              {step.type === "commands"
                ? filteredCommands.map((command, index) => (
                    <li key={command.id} role="option" aria-selected={index === activeIndex}>
                      <button
                        type="button"
                        onClick={() => void selectCommand(command)}
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
                  ))
                : pickerItems.map((item, index) => (
                    <li key={item.id} role="option" aria-selected={index === activeIndex}>
                      <button
                        type="button"
                        onClick={() => void selectPickerItem(item)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 px-3 py-2 text-left",
                          index === activeIndex
                            ? "bg-amber-500/20 text-amber-200"
                            : "text-stone-200 hover:bg-stone-800",
                        )}
                      >
                        <span>
                          <span className="block text-sm font-medium text-balance">{item.title}</span>
                          {item.subtitle ? (
                            <span className="mt-0.5 block text-xs text-stone-400 text-pretty">
                              {item.subtitle}
                            </span>
                          ) : null}
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
