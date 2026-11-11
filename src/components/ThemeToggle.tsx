"use client";

import { Moon, Sun } from "lucide-react";
import { toggleTheme, useThemeMode } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useThemeMode();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => toggleTheme()}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`header-pill-btn cursor-pointer ${className}`.trim()}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

