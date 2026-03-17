"use client";

import type { UserSettings as CoreUserSettings } from "@envelope/core";
import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import { cn } from "@/lib/client/cn";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { useDocumentTheme } from "@/lib/client/theme";

export type UserSettings = CoreUserSettings;

export type SettingsTabId = "appearance" | "workflow" | "inbox";

type SettingsPanelProps = {
  initial: UserSettings;
  initialTab?: SettingsTabId;
  surface?: "panel" | "plain";
  className?: string;
};

type ChoiceCardProps = {
  title: string;
  description: string;
  columnsClassName?: string;
  options: Array<{
    label: string;
    description: string;
    active: boolean;
    onSelect: () => void;
    swatchClassName?: string;
  }>;
};

const settingsTabs: Array<{
  id: SettingsTabId;
  label: string;
  summary: string;
}> = [
  {
    id: "appearance",
    label: "Appearance",
    summary: "Theme and accent",
  },
  {
    id: "workflow",
    label: "Workflow",
    summary: "Density and keymap",
  },
  {
    id: "inbox",
    label: "Inbox",
    summary: "Labels and focus",
  },
];

function ChoiceCard({ title, description, columnsClassName, options }: ChoiceCardProps) {
  return (
    <section className="envelope-panel-strong rounded-lg p-4">
      <div className="max-w-2xl">
        <h3 className="text-sm font-semibold text-balance">{title}</h3>
        <p className="envelope-text-muted mt-1 text-sm text-pretty">{description}</p>
      </div>

      <div className={cn("mt-4 grid gap-2 sm:grid-cols-2", columnsClassName)}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={option.onSelect}
            className={cn(
              "rounded-lg p-3 text-left transition-colors",
              option.active ? "envelope-button-accent" : "envelope-button-secondary",
            )}
          >
            {option.swatchClassName ? (
              <span
                aria-hidden="true"
                className={cn("mb-3 block size-3 rounded-full border border-black/10", option.swatchClassName)}
              />
            ) : null}
            <span className="block text-sm font-medium text-balance">{option.label}</span>
            <span className="envelope-text-muted mt-1 block text-xs text-pretty">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SettingsPanel({
  initial,
  initialTab = "appearance",
  surface = "panel",
  className,
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<UserSettings>(initial);
  const [error, setError] = useState<string | null>(null);

  useDocumentTheme(settings.theme, settings.accent);

  const save = async (patch: Partial<UserSettings>) => {
    setError(null);
    setSettings((current) => ({ ...current, ...patch }));

    const response = await fetch(
      "/api/settings",
      withCsrfHeaders({
        method: "POST",
        body: JSON.stringify(patch),
      }),
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to save settings");
      return;
    }

    const next = (await response.json()) as UserSettings;
    setSettings(next);
    window.dispatchEvent(new CustomEvent("envelope:settings:updated", { detail: next }));
  };

  return (
    <section
      className={cn(
        "grid gap-4",
        surface === "panel" ? "envelope-panel rounded-lg p-5" : "",
        className,
      )}
    >
      {error ? (
        <p className="envelope-status-danger rounded-lg px-3 py-2 text-sm" role="status" aria-live="polite">
          {error}
        </p>
      ) : null}

      <Tabs.Root defaultValue={initialTab} className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <Tabs.List
          aria-label="Settings categories"
          className="envelope-panel-strong flex gap-1 overflow-x-auto rounded-lg p-1 md:flex-col md:overflow-visible md:p-2"
        >
          {settingsTabs.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="rounded-md px-3 py-3 text-left transition-colors data-[state=active]:bg-[var(--color-selected)] data-[state=active]:text-[var(--color-text)]"
            >
              <span className="block text-sm font-medium text-balance">{tab.label}</span>
              <span className="envelope-text-muted mt-1 block text-xs text-pretty">{tab.summary}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="min-w-0">
          <Tabs.Content value="appearance" className="grid gap-4 outline-none">
            <ChoiceCard
              title="Theme"
              description="Set the overall canvas and panel treatment for the entire app."
              columnsClassName="sm:grid-cols-3"
              options={[
                {
                  label: "Dark",
                  description: "Low-glare surfaces tuned for long inbox sessions.",
                  active: settings.theme === "dark",
                  onSelect: () => {
                    void save({ theme: "dark" });
                  },
                },
                {
                  label: "Light",
                  description: "Bright surfaces with the same neutral palette and calm visual rhythm.",
                  active: settings.theme === "light",
                  onSelect: () => {
                    void save({ theme: "light" });
                  },
                },
                {
                  label: "System",
                  description: "Follow your operating system automatically throughout the day.",
                  active: settings.theme === "system",
                  onSelect: () => {
                    void save({ theme: "system" });
                  },
                },
              ]}
            />

            <ChoiceCard
              title="Accent"
              description="Pick the highlight color used for focus, selection, actions, and unread emphasis."
              columnsClassName="sm:grid-cols-3 lg:grid-cols-5"
              options={[
                {
                  label: "Amber",
                  description: "Warm and editorial.",
                  active: settings.accent === "amber",
                  onSelect: () => {
                    void save({ accent: "amber" });
                  },
                  swatchClassName: "bg-amber-400",
                },
                {
                  label: "Blue",
                  description: "Clean and technical.",
                  active: settings.accent === "blue",
                  onSelect: () => {
                    void save({ accent: "blue" });
                  },
                  swatchClassName: "bg-sky-400",
                },
                {
                  label: "Emerald",
                  description: "Calm and focused.",
                  active: settings.accent === "emerald",
                  onSelect: () => {
                    void save({ accent: "emerald" });
                  },
                  swatchClassName: "bg-emerald-400",
                },
                {
                  label: "Rose",
                  description: "Soft but vivid.",
                  active: settings.accent === "rose",
                  onSelect: () => {
                    void save({ accent: "rose" });
                  },
                  swatchClassName: "bg-rose-400",
                },
                {
                  label: "Violet",
                  description: "Cool and expressive.",
                  active: settings.accent === "violet",
                  onSelect: () => {
                    void save({ accent: "violet" });
                  },
                  swatchClassName: "bg-violet-400",
                },
              ]}
            />
          </Tabs.Content>

          <Tabs.Content value="workflow" className="grid gap-4 outline-none">
            <ChoiceCard
              title="Density"
              description="Control how much information fits into the inbox at once."
              options={[
                {
                  label: "Comfortable",
                  description: "A roomier list with more breathing space between threads.",
                  active: settings.density === "comfortable",
                  onSelect: () => {
                    void save({ density: "comfortable" });
                  },
                },
                {
                  label: "Compact",
                  description: "Tighter rows that surface more threads per viewport.",
                  active: settings.density === "compact",
                  onSelect: () => {
                    void save({ density: "compact" });
                  },
                },
              ]}
            />

            <ChoiceCard
              title="Keymap"
              description="Pick the keyboard language that matches how you move through mail."
              options={[
                {
                  label: "Superhuman",
                  description: "Command-style shortcuts geared for fast triage.",
                  active: settings.keymap === "superhuman",
                  onSelect: () => {
                    void save({ keymap: "superhuman" });
                  },
                },
                {
                  label: "Vim",
                  description: "Navigation centered on modal muscle memory and home-row control.",
                  active: settings.keymap === "vim",
                  onSelect: () => {
                    void save({ keymap: "vim" });
                  },
                },
              ]}
            />
          </Tabs.Content>

          <Tabs.Content value="inbox" className="grid gap-4 outline-none">
            <ChoiceCard
              title="Label visibility"
              description="Decide whether the inbox emphasizes the most useful labels or shows every rare provider label."
              options={[
                {
                  label: "Core labels",
                  description: "Keep uncommon provider labels tucked away to reduce noise.",
                  active: settings.hideRareLabels,
                  onSelect: () => {
                    void save({ hideRareLabels: true });
                  },
                },
                {
                  label: "All labels",
                  description: "Expose every label when you need the full mailbox vocabulary.",
                  active: !settings.hideRareLabels,
                  onSelect: () => {
                    void save({ hideRareLabels: false });
                  },
                },
              ]}
            />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </section>
  );
}
