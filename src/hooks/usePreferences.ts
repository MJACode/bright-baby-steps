import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";

interface Preferences {
  /** @deprecated superseded by hiddenHomeSections; kept to preserve stored shape. */
  showBriefing: boolean;
  briefingCollapsed: boolean;
  showNotifications: boolean;
  calendarView: "day" | "week";
  lastSlpZip: string;
  sleepPlanCollapsed: boolean;
  lastFeedingType: "bottle" | "breast" | "solid";
  lastBottleOz: string;
  calmMode: boolean;
  hiddenHomeSections: string[];
  homeSectionsMigrated: boolean;
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
  hiddenHomeSections: [],
  homeSectionsMigrated: false,
};
// Frozen so an accidental in-place mutation of a default value (e.g. pushing
// into hiddenHomeSections) throws instead of silently poisoning every caller.
Object.freeze(defaults);
Object.freeze(defaults.hiddenHomeSections);

function loadPrefs(key: string): Preferences {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const merged: Preferences = { ...defaults, ...JSON.parse(raw) };

    // One-time migration: carry the old briefing toggle into the new
    // hidden-sections list. The flag stops us re-hiding briefing after the
    // user re-enables it from the new Customize sheet.
    if (!merged.homeSectionsMigrated) {
      if (merged.showBriefing === false && !merged.hiddenHomeSections.includes("briefing")) {
        // Rebuild immutably — when the stored JSON has no hiddenHomeSections key,
        // the spread above leaves merged.hiddenHomeSections pointing at the shared
        // module-level defaults array; an in-place push would poison defaults.
        merged.hiddenHomeSections = [...merged.hiddenHomeSections, "briefing"];
      }
      merged.homeSectionsMigrated = true;
    }

    return merged;
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
