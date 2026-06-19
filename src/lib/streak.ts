import { format } from "date-fns";

export interface ForgivingStreak {
  // Length of the streak in days that have a log. The single tolerated gap day
  // is NOT counted toward the number — only days the parent actually logged.
  streak: number;
  // True when the streak spans a one-day gap that the "streak freeze" rescued.
  freezeUsed: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Forgiving tracking streak: walk consecutive days backward from today and count
 * days that have at least one log. A SINGLE missed day inside the run is tolerated
 * (a "streak freeze") and the walk continues past it; a second consecutive missed
 * day ends the streak. The freeze is derived purely from the log dates — no ledger.
 *
 * `logDateStrings` are the `yyyy-MM-dd` local-day keys of every recent log (order
 * doesn't matter, duplicates are fine). `today` defaults to now.
 */
export function computeForgivingStreak(
  logDateStrings: Iterable<string>,
  today: Date = new Date(),
): ForgivingStreak {
  const days = new Set(logDateStrings);
  if (days.size === 0) return { streak: 0, freezeUsed: false };

  let streak = 0;
  let freezeSpent = false;
  // A freeze only "rescued" the streak if a logged day was counted after it.
  let countedAfterFreeze = false;
  let checkDate = today;

  for (let i = 0; i < 365; i++) {
    const key = format(checkDate, "yyyy-MM-dd");
    if (days.has(key)) {
      streak++;
      if (freezeSpent) countedAfterFreeze = true;
    } else if (i === 0) {
      // No log today yet — the day isn't over, so don't break or spend a freeze.
    } else if (!freezeSpent) {
      // First missed day inside the run: spend the freeze and keep going.
      freezeSpent = true;
    } else {
      // Second missed day in a row — the streak ends here.
      break;
    }
    checkDate = new Date(checkDate.getTime() - DAY_MS);
  }

  return { streak, freezeUsed: countedAfterFreeze };
}
