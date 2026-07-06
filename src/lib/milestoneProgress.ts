// Pure progress math for the age-appropriate milestone set.
//
// "Age-appropriate" = every milestone whose typical-start age is at or below the
// child's age — i.e. the current band (start ≤ age ≤ end) plus every earlier band
// (age > end). Upcoming milestones (age < start) are excluded so the denominator
// only counts what the child could plausibly have reached. Extracted verbatim
// from MilestonesPage so both surfaces report identical numbers.

export interface SpeechRow {
  id: string;
  category_id: string;
  age_months_typical_start: number;
  age_months_typical_end: number;
}

export interface ChildSpeechRow {
  milestone_id: string;
  status: string;
}

export function ageAppropriateMilestoneIds(
  speech: SpeechRow[],
  ageMonths: number,
): Set<string> {
  const ids = new Set<string>();
  speech.forEach((m) => {
    if (ageMonths >= m.age_months_typical_start) ids.add(m.id);
  });
  return ids;
}

export interface Progress {
  achieved: number;
  total: number;
  pct: number;
}

export function computeProgress(
  speech: SpeechRow[],
  childSpeech: ChildSpeechRow[],
  ageMonths: number,
): Progress {
  const ids = ageAppropriateMilestoneIds(speech, ageMonths);
  const total = ids.size;
  const achieved = childSpeech.filter(
    (cs) => cs.status === "achieved" && ids.has(cs.milestone_id),
  ).length;
  const pct = total > 0 ? Math.round((achieved / total) * 100) : 0;
  return { achieved, total, pct };
}

export interface CategoryProgress {
  categoryId: string;
  achieved: number;
  total: number;
}

export function categoryProgress(
  speech: SpeechRow[],
  childSpeech: ChildSpeechRow[],
  ageMonths: number,
): CategoryProgress[] {
  const ids = ageAppropriateMilestoneIds(speech, ageMonths);
  const achievedIds = new Set(
    childSpeech.filter((cs) => cs.status === "achieved").map((cs) => cs.milestone_id),
  );

  const byCategory = new Map<string, CategoryProgress>();
  speech.forEach((m) => {
    if (!ids.has(m.id)) return;
    const entry =
      byCategory.get(m.category_id) ??
      { categoryId: m.category_id, achieved: 0, total: 0 };
    entry.total += 1;
    if (achievedIds.has(m.id)) entry.achieved += 1;
    byCategory.set(m.category_id, entry);
  });

  return Array.from(byCategory.values());
}
