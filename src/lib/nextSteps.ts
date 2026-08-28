import { CHILD_INTERESTS } from "@/lib/childInterests";

export type NextStepDomain = "sleep" | "milestone" | "finance" | "health";

export type NextStepTier = "default" | "soon" | "redflag";

export interface NextStepDeeplink {
  kind: "route" | "ask" | "sheet";
  // route → a router path; ask → ignored (seedPrompt/forceSkill drive it);
  // sheet → an opaque key the feed maps to opening an existing Sheet.
  target: string;
  seedPrompt?: string;
  forceSkill?: string;
}

export interface NextStepSortHints {
  // Lower is more urgent. Used to break ties inside the dated-deadline band.
  // Days remaining until the action's deadline, or undefined for evergreen items.
  daysUntil?: number;
  // Minutes until a same-day window opens/closes (sleep). Undefined otherwise.
  minutesUntil?: number;
  // Stable secondary sort so equal-urgency items don't reorder between renders.
  order?: number;
  // 0–2 personalization boost (interest match = 2, memory nudge = 1). Compared
  // strictly WITHIN a band — urgency bands always dominate; affinity only
  // reorders peers.
  affinity?: number;
}

export interface NextStepItem {
  id: string;
  domain: NextStepDomain;
  title: string;
  meta: string;
  tier: NextStepTier;
  deeplink: NextStepDeeplink;
  sortHints?: NextStepSortHints;
  // Lowercase interest label when the item was picked for an interest match —
  // drives the "picked for a … fan" meta suffix in the feed.
  affinityLabel?: string;
}

// Which rows get a ✓ and a "…" menu. useNextSteps' complete/snooze/dismiss
// handlers only resolve finance and milestone ids; sleep and health rows route
// to their source surface and have nothing to write back from the feed. Render
// the controls off that fact rather than shipping a tap that does nothing.
export function hasFeedActions(item: NextStepItem): boolean {
  return item.domain === "finance" || item.domain === "milestone";
}

// Interest slug → speech_categories.slug. Verified against the live
// speech_categories seed — keep both sides in sync with the DB, not guesses.
export const INTEREST_MILESTONE_CATEGORY: Record<string, string> = {
  music: "speech-language",
  books: "speech-language",
  movement: "gross-motor",
  water_play: "gross-motor",
  outdoors: "gross-motor",
  building: "fine-motor",
  food_exploring: "fine-motor",
  animals: "social-emotional",
  pretend_play: "social-emotional",
  vehicles: "cognitive",
};

export function matchingInterestForCategory(
  interests: string[] | null | undefined,
  categorySlug: string | null | undefined,
): string | null {
  if (!interests?.length || !categorySlug) return null;
  return (
    interests.find(
      (slug) => INTEREST_MILESTONE_CATEGORY[slug] === categorySlug,
    ) ?? null
  );
}

export function interestAffinityForCategory(
  interests: string[] | null | undefined,
  categorySlug: string | null | undefined,
): number {
  return matchingInterestForCategory(interests, categorySlug) ? 2 : 0;
}

export function interestLabelLower(slug: string): string {
  const label =
    CHILD_INTERESTS.find((i) => i.value === slug)?.label ??
    slug.replace(/_/g, " ");
  return label.toLowerCase();
}

// Memory-aware nudge: keyword → feed-domain map for child_memories rows with
// category 'concern' or 'goal'. Matching is intentionally dumb
// content.toLowerCase().includes() — no stemming, no NLP. Memories only bias
// ordering (affinity 1), never create items, so a loose match is harmless.
// "feeding" has no feed items yet; the bucket exists so future feeding items
// pick it up for free.
export const MEMORY_NUDGE_KEYWORDS = {
  sleep: ["sleep", "nap", "night", "bedtime"],
  feeding: ["feed", "bottle", "nurs", "solid", "eat"],
  milestone: ["talk", "word", "speech", "babbl", "walk", "crawl", "milestone"],
} as const;

export type MemoryNudgeDomain = keyof typeof MEMORY_NUDGE_KEYWORDS;

export function memoryNudgeDomains(
  memories: Array<{ content: string }>,
): Set<MemoryNudgeDomain> {
  const matched = new Set<MemoryNudgeDomain>();
  for (const memory of memories) {
    const text = memory.content.toLowerCase();
    for (const domain of Object.keys(
      MEMORY_NUDGE_KEYWORDS,
    ) as MemoryNudgeDomain[]) {
      if (MEMORY_NUDGE_KEYWORDS[domain].some((k) => text.includes(k))) {
        matched.add(domain);
      }
    }
  }
  return matched;
}

// Coarse priority band, lowest sorts first:
//   0 redflag                       — rare, pediatrician-defined
//   1 closing-today (nap due / deadline ≤2 days)
//   2 dated deadlines (soonest-first)
//   3 focus drills (today's milestone encouragement)
//   4 evergreen (no deadline)
function band(item: NextStepItem): number {
  if (item.tier === "redflag") return 0;

  const days = item.sortHints?.daysUntil;
  const mins = item.sortHints?.minutesUntil;

  // A sleep window opening/closing today, or a deadline within 2 days, is "closing today".
  const napClosingToday = item.domain === "sleep" && mins != null;
  const deadlineClosingSoon = days != null && days <= 2;
  if (napClosingToday || deadlineClosingSoon) return 1;

  if (days != null) return 2;

  if (item.domain === "milestone") return 3;

  return 4;
}

function withinBandKey(item: NextStepItem): number {
  // Inside a band, sort by the tightest available time signal: minutes for
  // same-day sleep windows, otherwise days. Items without either keep a high
  // key so dated items lead. The stable `order` hint breaks remaining ties.
  const mins = item.sortHints?.minutesUntil;
  const days = item.sortHints?.daysUntil;
  if (mins != null) return mins;
  if (days != null) return days * 24 * 60;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Rank the feed: redflag → closing-today → dated-deadline (soonest first) →
 * focus drills → evergreen. Within a band, higher affinity leads its peers —
 * affinity never lifts an item across bands. Then apply the domain-dominance
 * cap: never more
 * than 2 items of the same domain in the top 3 — the third top-3 slot can't be
 * a third sleep/finance/etc. item; that item is pushed below the cut so the
 * feed reads cross-domain rather than salesy. Overflow lands in "See more".
 */
export function rankNextSteps(items: NextStepItem[]): NextStepItem[] {
  const sorted = [...items].sort((a, b) => {
    const bandDiff = band(a) - band(b);
    if (bandDiff !== 0) return bandDiff;
    const affinityDiff =
      (b.sortHints?.affinity ?? 0) - (a.sortHints?.affinity ?? 0);
    if (affinityDiff !== 0) return affinityDiff;
    const keyDiff = withinBandKey(a) - withinBandKey(b);
    if (keyDiff !== 0) return keyDiff;
    return (a.sortHints?.order ?? 0) - (b.sortHints?.order ?? 0);
  });

  // Domain-dominance cap over the top 3: as we fill the top slots, skip an item
  // whose domain already holds 2 of the (up to 3) leading slots, and defer it
  // to after the cut. Items past the top 3 are unaffected.
  const TOP = 3;
  const CAP = 2;
  const top: NextStepItem[] = [];
  const deferred: NextStepItem[] = [];
  const rest: NextStepItem[] = [];
  const domainCount: Record<string, number> = {};

  for (const item of sorted) {
    if (top.length >= TOP) {
      rest.push(item);
      continue;
    }
    const count = domainCount[item.domain] ?? 0;
    if (count >= CAP) {
      deferred.push(item);
      continue;
    }
    top.push(item);
    domainCount[item.domain] = count + 1;
  }

  return [...top, ...deferred, ...rest];
}
