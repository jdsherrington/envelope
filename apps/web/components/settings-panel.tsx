"use client";

import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

type UserSettings = {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  keymap: "superhuman" | "vim";
  contrast: "standard" | "high";
  hideRareLabels: boolean;
};

export function SettingsPanel({ initial }: { initial: UserSettings }) {
  const [settings, setSettings] = useState<UserSettings>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Partial<UserSettings>) => {
    setError(null);
    setStatus(null);
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
    setStatus("Settings saved");
  };

  return (
    <section className="grid gap-4 rounded-2xl border border-stone-800 bg-stone-900/80 p-5">
      {status ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2">
        <p className="text-sm text-stone-300">Theme</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void save({ theme: "dark" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => {
              void save({ theme: "light" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Light
          </button>
          <span className="text-xs text-stone-500">Current: {settings.theme}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm text-stone-300">Density</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void save({ density: "comfortable" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Comfortable
          </button>
          <button
            type="button"
            onClick={() => {
              void save({ density: "compact" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Compact
          </button>
          <span className="text-xs text-stone-500">Current: {settings.density}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm text-stone-300">Keymap</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void save({ keymap: "superhuman" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Superhuman
          </button>
          <button
            type="button"
            onClick={() => {
              void save({ keymap: "vim" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Vim
          </button>
          <span className="text-xs text-stone-500">Current: {settings.keymap}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm text-stone-300">Labels</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void save({ hideRareLabels: !settings.hideRareLabels });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            {settings.hideRareLabels ? "Show Rare Labels" : "Hide Rare Labels"}
          </button>
          <span className="text-xs text-stone-500">
            Current: {settings.hideRareLabels ? "Hidden" : "Visible"}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm text-stone-300">Contrast</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void save({ contrast: "standard" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => {
              void save({ contrast: "high" });
            }}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase"
          >
            High
          </button>
          <span className="text-xs text-stone-500">Current: {settings.contrast}</span>
        </div>
      </div>
    </section>
  );
}
