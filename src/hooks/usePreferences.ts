import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";

interface Preferences {
  showBriefing: boolean;
  briefingCollapsed: boolean;
  showNotifications: boolean;
  calendarView: "day" | "week";
  lastSlpZip: string;
  sleepPlanCollapsed: boolean;
  lastFeedingType: "bottle" | "breast" | "solid";
  lastBottleOz: string;
  calmMode: boolean;
}

const defaults: Preferences = {
  showBriefing: true,
  briefingCollapsed: true,
  showNotifications: true,
  calendarView: "day",
  lastSlpZip: "",
  sleepPlanCollapsed: false,
  lastFeedingType: "bottle",
  lastBottleOz: "",
  calmMode: false,
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
      // Write localStorage outside the state updater: updaters pending on a
      // fiber that unmounts before rendering are discarded, which would drop
      // the persisted write (e.g. quick-log sheets that close on save).
      const next = { ...loadPrefs(key), ...updates };
      localStorage.setItem(key, JSON.stringify(next));
      setPrefsState(next);
    },
    [key]
  );

  return { prefs, setPrefs };
}
