import { describe, expect, it } from "vitest";

import {
  CAP_EXEMPT_TYPES,
  countExistingToday,
  countsTowardDailyCap,
} from "../../supabase/functions/_shared/notificationCap";

// Locks check-notifications' daily-cap "existing today" count, imported
// straight from supabase/functions/_shared (same pattern as
// allergenMaintenance.server.test.ts).

const TODAY = "2026-10-17";
const isToday = (createdAt: string) => createdAt.startsWith(TODAY);
const row = (type: string, created_at = `${TODAY}T09:00:00Z`) => ({ type, created_at });

describe("daily cap: existing-today count", () => {
  it("caregiver_note rows never count toward the cap", () => {
    expect(countsTowardDailyCap("caregiver_note")).toBe(false);
    const notes = [row("caregiver_note"), row("caregiver_note"), row("caregiver_note")];
    expect(countExistingToday(notes, isToday)).toBe(0);
  });

  it("three notes plus one nudge leave room for two more under the default cap of 3", () => {
    const rows = [
      row("caregiver_note"),
      row("caregiver_note"),
      row("caregiver_note"),
      row("sleep_reminder"),
    ];
    expect(countExistingToday(rows, isToday)).toBe(1);
  });

  it("nudges from every producer still count, reactivation included", () => {
    const rows = [row("sleep_reminder"), row("diaper_reminder"), row("reactivation"), row("some_future_type")];
    expect(countExistingToday(rows, isToday)).toBe(4);
  });

  it("only rows on the recipient's local today count", () => {
    const rows = [row("sleep_reminder", "2026-10-16T23:00:00Z"), row("sleep_reminder")];
    expect(countExistingToday(rows, isToday)).toBe(1);
  });

  it("caregiver_note is the only exempt type", () => {
    expect([...CAP_EXEMPT_TYPES]).toEqual(["caregiver_note"]);
  });
});
