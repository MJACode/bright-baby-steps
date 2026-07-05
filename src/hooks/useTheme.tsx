import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import { usePreferences, type ThemePreference } from "./usePreferences";

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  // Keep browser/status-bar chrome (theme-color meta) in sync with the
  // resolved --background token instead of a hardcoded hex.
  const meta = document.querySelector('meta[name="theme-color"]');
  const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  if (meta && background) meta.setAttribute("content", `hsl(${background})`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs, setPrefs } = usePreferences();
  const theme = prefs.theme;

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(theme === "dark" || (theme === "system" && media.matches));
    if (theme !== "system") return;
    const onChange = (e: MediaQueryListEvent) => applyTheme(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme: (next) => setPrefs({ theme: next }) }),
    [theme, setPrefs],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
