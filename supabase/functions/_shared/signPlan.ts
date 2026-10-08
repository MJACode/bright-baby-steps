// Pure helpers for generate-sign-plan (Sign Language coach).
//
// Kept free of Deno globals and URL imports on purpose: the only import is the
// relative ./signSlugs.ts, so vitest can import this file directly and lock
// the server logic against the client (Principle V). See
// src/test/signPlan.server.test.ts — in particular, isStalled() here must
// agree with stalled() in src/lib/signProgress.ts.
//
// Contract: specs/001-baby-signs-v2/contracts/generate-sign-plan.md.

import { SIGN_SLUGS } from "./signSlugs.ts";

// Caps from the SignPlan contract.
export const MAX_INTRO = 240;
export const MAX_WHY = 140;
export const MAX_MOMENT = 120;
export const MAX_TRY_THIS = 200;
export const MAX_FOCUS = 3;
export const MAX_MOMENTS = 2;
export const MAX_STUCK = 3;

// Request caps.
export const MAX_SIGNS = 20;
export const MAX_AGE_MONTHS = 60;
export const MAX_PRACTICE_DAYS_4W = 28;
export const MAX_FOCUS_DAYS = 3660;
// The client computes focusDays from its local tracking day; a focus_since
// stamped on a device a timezone ahead can briefly read as -1 (or a few days
// negative after a clock fix). Those are clamped to 0, not rejected.
export const MIN_FOCUS_DAYS = -7;
// Mirrors FOCUS_READY_AFTER_DAYS / stalled() in src/lib/signProgress.ts.
export const STALLED_AFTER_FOCUS_DAYS = 14;

const SIGN_SLUG_SET: ReadonlySet<string> = new Set(SIGN_SLUGS);
const STATUSES = new Set(["introduced", "emerging", "signing"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Backstop for the prompt's tone rules (Principle I, FR-025): any model string
// that diagnoses, mentions delays / red flags / "behind" / "should" / worry /
// evaluation, counts days or streaks, or suggests withholding until the baby
// signs is dropped rather than shown to a parent.
// "behind" is matched only in developmental phrasing so a peekaboo moment
// ("hide a toy behind your back") survives; "late" only as "late talker /
// signer / bloomer" so "late afternoon" survives.
export const OFF_TONE_RE = new RegExp(
  "\\b(?:" +
    [
      "delay(?:s|ed)?",
      "fall(?:s|ing|en)? behind",
      "behind (?:schedule|peers|other)",
      "is behind",
      "lagging",
      "late (?:talker|signer|bloomer)s?",
      "red[\\s-]?flags?",
      "should(?:n't)?",
      "diagnos\\w*",
      "disorder",
      "evaluat\\w*",
      "therapists?",
      "worr(?:y|ied|ies|ying)",
      "concern(?:s|ed|ing)?",
      "missed",
      "skipped",
      "days? without",
      "streaks?",
      "until (?:your baby|they|she|he) signs?",
      "before you give",
      "make (?:your baby|them) sign",
    ].join("|") +
    ")\\b",
  "i",
);

export const FALLBACK_INTRO = "Here are a few signs to model with your baby this week.";

export type SignStatus = "introduced" | "emerging" | "signing";

export type SignInput = {
  slug: string;
  status: SignStatus | null;
  isFocus: boolean;
  focusDays: number | null;
  practiceDays4w: number;
};

export type ValidInput = {
  childId: string;
  weekStart: string;
  correctedAgeMonths: number;
  signs: SignInput[];
};

export type SignPlan = {
  weekStart: string;
  intro: string;
  focus: Array<{ slug: string; why: string; moments: string[] }>;
  stuck: Array<{ slug: string; tryThis: string }>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** "YYYY-MM-DD" of the UTC Monday that starts the week containing `ms`. */
export function utcMondayKey(ms: number): string {
  const d = new Date(ms);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * The client sends its local planWeekStart. Accept it only if it is a real
 * Monday equal to the UTC Monday of (now - 1 day) or (now + 1 day), which
 * covers every U.S. timezone around the Sunday/Monday boundary (research R5).
 * On Sunday/Monday UTC two Mondays are acceptable, so this alone does NOT
 * enforce one plan per week — planExistsForWeek() does.
 */
export function isAcceptableWeekStart(weekStart: unknown, nowMs: number): weekStart is string {
  if (typeof weekStart !== "string" || !DATE_RE.test(weekStart)) return false;
  const parsed = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.toISOString().slice(0, 10) !== weekStart) return false; // e.g. 2026-02-30
  if (parsed.getUTCDay() !== 1) return false;
  return weekStart === utcMondayKey(nowMs - DAY_MS) || weekStart === utcMondayKey(nowMs + DAY_MS);
}

/**
 * Weekly limit (FR-020). A stored plan blocks generation when its week is the
 * requested week OR LATER. Equality alone let a caller alternate between the
 * two Mondays accepted on Sunday/Monday UTC and generate unboundedly, and let
 * an older week overwrite a newer plan. ISO "YYYY-MM-DD" strings compare
 * lexicographically in date order.
 */
export function planExistsForWeek(
  existingWeekStart: string | null | undefined,
  requestedWeekStart: string,
): boolean {
  return typeof existingWeekStart === "string" && existingWeekStart >= requestedWeekStart;
}

/**
 * Allowlist validation. Builds a fresh object from the permitted fields only,
 * so nothing else in the body can reach the prompt. Returns null on any
 * violation.
 */
export function validateInput(body: unknown, nowMs: number): ValidInput | null {
  if (!isPlainObject(body)) return null;
  const { childId, weekStart, correctedAgeMonths, signs } = body;

  if (typeof childId !== "string" || !UUID_RE.test(childId)) return null;
  if (!isAcceptableWeekStart(weekStart, nowMs)) return null;
  if (!isIntInRange(correctedAgeMonths, 0, MAX_AGE_MONTHS)) return null;
  if (!Array.isArray(signs) || signs.length > MAX_SIGNS) return null;

  const seen = new Set<string>();
  const cleanSigns: SignInput[] = [];
  for (const raw of signs) {
    if (!isPlainObject(raw)) return null;
    const { slug, status, isFocus, focusDays, practiceDays4w } = raw;
    if (typeof slug !== "string" || !SIGN_SLUG_SET.has(slug) || seen.has(slug)) return null;
    seen.add(slug);
    if (status !== null && !(typeof status === "string" && STATUSES.has(status))) return null;
    if (typeof isFocus !== "boolean") return null;
    if (focusDays !== null && !isIntInRange(focusDays, MIN_FOCUS_DAYS, MAX_FOCUS_DAYS)) return null;
    if (!isIntInRange(practiceDays4w, 0, MAX_PRACTICE_DAYS_4W)) return null;
    cleanSigns.push({
      slug,
      status: status as SignStatus | null,
      isFocus,
      // focusDays is meaningful only for focus signs (contract: null if not
      // focus). Slightly negative values are clamped to 0 (see MIN_FOCUS_DAYS).
      focusDays: isFocus && focusDays !== null ? Math.max(0, focusDays as number) : null,
      practiceDays4w,
    });
  }

  return { childId, weekStart, correctedAgeMonths, signs: cleanSigns };
}

/** Mirrors stalled() in src/lib/signProgress.ts (locked by signPlan.server.test.ts). */
export function isStalled(s: SignInput): boolean {
  return (
    s.isFocus &&
    s.focusDays !== null &&
    s.focusDays >= STALLED_AFTER_FOCUS_DAYS &&
    s.status === "introduced" &&
    s.practiceDays4w >= 1
  );
}

export function buildUserText(input: ValidInput): string {
  const bySlug = new Map(input.signs.map((s) => [s.slug, s]));
  const lines = SIGN_SLUGS.map((slug) => {
    const s = bySlug.get(slug);
    if (!s) return `- ${slug}: not started`;
    const parts = [s.status ?? "not started"];
    if (s.isFocus) {
      parts.push(s.focusDays !== null ? `current focus for ${s.focusDays} days` : "current focus");
    }
    // Zero practice days are omitted on purpose (prompt: never mention days
    // without practice; lessons 2026-09-07 on printed zeros).
    if (s.practiceDays4w > 0) parts.push(`modeled on ${s.practiceDays4w} of the last 28 days`);
    if (isStalled(s)) parts.push("STALLED");
    return `- ${slug}: ${parts.join(", ")}`;
  });
  return [
    `Corrected age: ${input.correctedAgeMonths} months.`,
    `Library signs and progress (slug: status):`,
    ...lines,
  ].join("\n");
}

export function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length === 0 || s.length > max) return null;
  if (OFF_TONE_RE.test(s)) return null;
  return s;
}

/**
 * Validate model output against SignPlan. Rebuilds every object from known
 * fields only. The prompt asks for 2–3 focus signs; at least 1 must survive
 * sanitization, otherwise this returns null (-> 422 unusable_plan).
 */
export function sanitizePlan(
  raw: unknown,
  weekStart: string,
  stalledSlugs: ReadonlySet<string>,
): SignPlan | null {
  if (!isPlainObject(raw)) return null;

  const focus: SignPlan["focus"] = [];
  const focusSeen = new Set<string>();
  for (const item of Array.isArray(raw.focus) ? raw.focus : []) {
    if (focus.length >= MAX_FOCUS) break;
    if (!isPlainObject(item)) continue;
    const slug = item.slug;
    if (typeof slug !== "string" || !SIGN_SLUG_SET.has(slug) || focusSeen.has(slug)) continue;
    const why = cleanString(item.why, MAX_WHY);
    if (!why) continue;
    const moments: string[] = [];
    for (const m of Array.isArray(item.moments) ? item.moments : []) {
      if (moments.length >= MAX_MOMENTS) break;
      const c = cleanString(m, MAX_MOMENT);
      if (c) moments.push(c);
    }
    if (moments.length === 0) continue;
    focusSeen.add(slug);
    focus.push({ slug, why, moments });
  }
  if (focus.length === 0) return null;

  const stuck: SignPlan["stuck"] = [];
  const stuckSeen = new Set<string>();
  for (const item of Array.isArray(raw.stuck) ? raw.stuck : []) {
    if (stuck.length >= MAX_STUCK) break;
    if (!isPlainObject(item)) continue;
    const slug = item.slug;
    if (typeof slug !== "string" || !stalledSlugs.has(slug) || stuckSeen.has(slug)) continue;
    const tryThis = cleanString(item.tryThis, MAX_TRY_THIS);
    if (!tryThis) continue;
    stuckSeen.add(slug);
    stuck.push({ slug, tryThis });
  }

  const intro = cleanString(raw.intro, MAX_INTRO) ?? FALLBACK_INTRO;

  return { weekStart, intro, focus, stuck };
}
