"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SettingsPanel, type SettingsTabId, type UserSettings } from "@/components/settings-panel";

type SettingsDialogProps = {
  initial: UserSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTabId;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function SettingsDialog({
  initial,
  open,
  onOpenChange,
  initialTab = "appearance",
}: SettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="envelope-overlay fixed inset-0 z-overlay" />
        <Dialog.Content className="fixed inset-0 z-modal flex items-start justify-center p-4 pt-8 outline-none md:items-center md:p-6">
          <div className="envelope-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-[56rem] flex-col overflow-hidden rounded-lg shadow-xl">
            <div className="envelope-panel-muted envelope-divider flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <p className="envelope-text-soft text-xs font-medium uppercase">Preferences</p>
                <Dialog.Title className="mt-2 text-[1.75rem] font-semibold leading-none text-balance">
                  Settings
                </Dialog.Title>
                <Dialog.Description className="envelope-text-muted mt-2 max-w-2xl text-sm text-pretty">
                  Adjust the look, feel, and workflow defaults for Envelope without leaving the inbox.
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close settings"
                  className="envelope-button-secondary flex size-10 items-center justify-center rounded-lg transition-colors"
                >
                  <CloseIcon />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <SettingsPanel initial={initial} initialTab={initialTab} surface="plain" />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
