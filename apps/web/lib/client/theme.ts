"use client";

import { useEffect } from "react";

export type AppTheme = "dark" | "light";

const storageKey = "envelope-theme";

export const applyDocumentTheme = (theme: AppTheme): void => {
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
  root.classList.toggle("dark", theme === "dark");

  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Storage access can fail in some private browsing contexts.
  }
};

export const useDocumentTheme = (theme: AppTheme): void => {
  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);
};
