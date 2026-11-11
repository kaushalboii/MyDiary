"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "mydiary_theme_v1";
export const THEME_EVENT = "mydiary:theme-changed";

export function readDomTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#171513" : "#f3efe8");
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage access errors in private contexts
  }

  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: theme }));
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = readDomTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export function useThemeMode(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(readDomTheme());

    function onThemeChange(event: Event) {
      const custom = event as CustomEvent<ThemeMode>;
      if (custom.detail === "dark" || custom.detail === "light") {
        setTheme(custom.detail);
      } else {
        setTheme(readDomTheme());
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next: ThemeMode = event.newValue === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      setTheme(next);
    }

    window.addEventListener(THEME_EVENT, onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return theme;
}

