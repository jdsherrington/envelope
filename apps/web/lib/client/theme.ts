"use client";

import { useEffect } from "react";

export type AppTheme = "dark" | "light" | "system";
export type AppAccent = "amber" | "blue" | "emerald" | "rose" | "violet";

const themeStorageKey = "envelope-theme";
const accentStorageKey = "envelope-accent";

const resolveSystemTheme = (): "dark" | "light" =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const applyDocumentTheme = (theme: AppTheme, accent: AppAccent): void => {
  const root = document.documentElement;
  const resolvedTheme = theme === "system" ? resolveSystemTheme() : theme;
  root.dataset["theme"] = resolvedTheme;
  root.dataset["themePreference"] = theme;
  root.dataset["accent"] = accent;
  root.style.colorScheme = resolvedTheme;
  root.classList.toggle("dark", resolvedTheme === "dark");

  try {
    window.localStorage.setItem(themeStorageKey, theme);
    window.localStorage.setItem(accentStorageKey, accent);
  } catch {
    // Storage access can fail in some private browsing contexts.
  }
};

export const useDocumentTheme = (theme: AppTheme, accent: AppAccent): void => {
  useEffect(() => {
    const apply = () => {
      applyDocumentTheme(theme, accent);
    };

    apply();

    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", apply);
    return () => {
      mediaQuery.removeEventListener("change", apply);
    };
  }, [accent, theme]);
};
