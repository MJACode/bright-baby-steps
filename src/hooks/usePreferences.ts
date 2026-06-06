import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";

interface Preferences {
  showBriefing: boolean;
  briefingCollapsed: boolean;
  showNotifications: boolean;
  calendarView: "day" | "week";
  lastSlpZip: string;
}

const defaults: Preferences = {
  showBriefing: true,
  briefingCollapsed: false,
  showNotifications: true,
  calendarView: "day",
  lastSlpZip: "",
};

function loadPrefs(key: string): Preferences {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function usePreferences() {
  const { user } = useAuth();
  const key = user ? `prefs_${user.id}` : "prefs_guest";

  const [prefs, setPrefsState] = useState<Preferences>(() => loadPrefs(key));

  const setPrefs = useCallback(
    (updates: Partial<Preferences>) => {
      setPrefsState((prev) => {
        const next = { ...prev, ...updates };
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  return { prefs, setPrefs };
}
