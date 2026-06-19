import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, differenceInMinutes, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAgeInMonths, isInRetroactiveGracePeriod } from "@/hooks/useChildren";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { toast } from "@/hooks/use-toast";
import { rankNextSteps, type NextStepItem } from "@/lib/nextSteps";
import {
  getFinanceCalendarEvents,
  type FinanceCalendarType,
} from "@/lib/financeCalendar";

interface ChildLite {
  id: string;
  name: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
  next_appointment?: string | null;
  created_at?: string | null;
  retroactive_setup_completed_at?: string | null;
}

// Coach-state phrasing reused from SleepCoachCard:30-76 — only `coming-up` and
// `open` emit a feed item, with meta phrased as time-remaining.
function deriveSleepFeed(
  now: Date,
  windowStart: Date,
  windowEnd: Date,
): { title: string; meta: string; minutesUntil: number } | null {
  const nowMs = now.getTime();
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();

  if (nowMs < startMs) {
    const msToStart = startMs - nowMs;
    if (msToStart > 15 * 60_000) return null; // heads-up only, not actionable yet
    const minutes = Math.max(0, Math.floor(msToStart / 60_000));
    return {
      title: `Nap window around ${format(windowStart, "h:mm a")}`,
      meta: minutes < 1 ? "starting now" : `in ~${minutes} min`,
      minutesUntil: minutes,
    };
  }

  if (nowMs <= endMs) {
    return {
      title: "Nap window is open",
      meta: `until ${format(windowEnd, "h:mm a")}`,
      minutesUntil: 0,
    };
  }

  return null;
}

// Finance age-prompt copy reused from FinancialTab:19-36 (benefit-framed,
// never "$ you're owed"). `bracket` is the AgePromptBanner localStorage dismiss
// key (FinancialTab.tsx:19-36). `seedTitle` is the EXACT title of the seeded
// financial_checklist_items row (20260407000000_financial_checklist_overhaul.sql)
// this prompt maps to — it resolves to that row's UUID, which is what
// parent_financial_checklist.checklist_item_id actually FKs to.
function getFinancePrompt(ageMonths: number, ageDays: number) {
  if (ageDays <= 30)
    return {
      bracket: "fin-prompt-0-3",
      seedTitle: "Add baby to your health insurance",
      title: "Add your baby to your health insurance",
      meta: "most plans allow ~30 days — check yours",
    };
  if (ageMonths < 6)
    return {
      bracket: "fin-prompt-3-6",
      seedTitle: "Build or top up your emergency fund",
      title: "Start a small emergency fund",
      meta: "even $500 cushions surprise costs",
    };
  if (ageMonths < 12)
    return {
      bracket: "fin-prompt-6-12",
      seedTitle: "Review your life insurance coverage",
      title: "Look into life insurance for your family",
      meta: "term policies are usually the low-cost option",
    };
  return {
    bracket: "fin-prompt-12",
    seedTitle: "Open a 529 college savings plan",
    title: "Compare ways to start saving for your child",
    meta: "529, UGMA, HYSA and more",
  };
}

const MILESTONE_LOOKAHEAD_MONTHS = 2;

interface MilestoneRow {
  id: string;
  name: string;
  age_months_typical_start: number;
}

// Transient dismiss for the milestone focus drill (no DB home) — mirrors
// useSleepAlertPopup's per-child/per-day localStorage scheme.
function milestoneDismissKey(childId: string): string {
  return `nextstep_milestone_dismissed_${childId}`;
}

function readMilestoneDismissed(childId: string, dayKey: string): string[] {
  try {
    const raw = localStorage.getItem(milestoneDismissKey(childId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.day !== dayKey || !Array.isArray(parsed.ids)) return [];
    return parsed.ids.filter((v: unknown): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function persistMilestoneDismissed(childId: string, dayKey: string, ids: string[]) {
  try {
    localStorage.setItem(
      milestoneDismissKey(childId),
      JSON.stringify({ day: dayKey, ids }),
    );
  } catch {
    // localStorage unavailable — the in-memory hide still holds for this session.
  }
}

// Finance snooze/dismiss is a per-parent localStorage transient, NOT a DB status.
// parent_financial_checklist.status only carries the values FinancialTab writes
// ("completed" / "not_started"); "snoozed"/"not_applicable" are not part of that
// table's contract, so we hide the feed prompt client-side rather than write an
// unverified status. A finance ✓ still writes "completed" to the shared row.
function financeDismissKey(parentId: string): string {
  return `nextstep_finance_dismissed_${parentId}`;
}

function readFinanceDismissed(parentId: string): string[] {
  try {
    const raw = localStorage.getItem(financeDismissKey(parentId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v: unknown): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function persistFinanceDismissed(parentId: string, itemIds: string[]) {
  try {
    localStorage.setItem(
      financeDismissKey(parentId),
      JSON.stringify(itemIds),
    );
  } catch {
    // localStorage unavailable — the in-memory hide still holds for this session.
  }
}

// Per-child, per-occurrence dismiss for the recurring finance-calendar items.
// Keyed by occurrence year so a dismiss this year doesn't suppress next year's
// recurrence (mirrors the milestone transient-dismiss scheme above).
function financeCalendarDismissKey(
  type: FinanceCalendarType,
  year: number,
  childId: string,
): string {
  return `nextstep_fincal_${type}_${year}_${childId}`;
}

function isFinanceCalendarDismissed(
  type: FinanceCalendarType,
  year: number,
  childId: string,
): boolean {
  try {
    return localStorage.getItem(financeCalendarDismissKey(type, year, childId)) === "1";
  } catch {
    return false;
  }
}

function persistFinanceCalendarDismissed(
  type: FinanceCalendarType,
  year: number,
  childId: string,
) {
  try {
    localStorage.setItem(financeCalendarDismissKey(type, year, childId), "1");
  } catch {
    // localStorage unavailable — the in-memory hide still holds for this session.
  }
}

export interface UseNextStepsResult {
  items: NextStepItem[];
  isLoading: boolean;
  isError: boolean;
  complete: (item: NextStepItem) => void;
  snooze: (item: NextStepItem) => void;
  dismiss: (item: NextStepItem) => void;
}

export function useNextSteps(activeChild: ChildLite | null): UseNextStepsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const dayKey = format(now, "yyyy-MM-dd");

  // Sleep
  const sleep = useSleepCoach(activeChild);
  useSleepPlan(activeChild?.id ?? null);

  // Milestones — "coming up" = typical-start within the next ~2 months and not
  // yet achieved. Celebratory, never diagnostic.
  const milestones = useQuery({
    queryKey: ["next-steps-milestones", activeChild?.id],
    queryFn: async () => {
      const ageMonths = getAgeInMonths(
        activeChild!.date_of_birth,
        activeChild!.is_premature ?? false,
        activeChild!.due_date,
      );
      const { data: speech, error: speechErr } = await supabase
        .from("speech")
        .select("id, name, age_months_typical_start")
        .gte("age_months_typical_start", ageMonths)
        .lte("age_months_typical_start", ageMonths + MILESTONE_LOOKAHEAD_MONTHS)
        .order("age_months_typical_start", { ascending: true });
      if (speechErr) throw speechErr;
      const { data: child, error: childErr } = await supabase
        .from("child_speech")
        .select("milestone_id, status")
        .eq("child_id", activeChild!.id);
      if (childErr) throw childErr;
      const achieved = new Set(
        (child ?? [])
          .filter((c) => c.status === "achieved")
          .map((c) => c.milestone_id),
      );
      return (speech ?? []).filter(
        (m) => !achieved.has(m.id),
      ) as MilestoneRow[];
    },
    enabled: !!activeChild && !activeChild.is_expected,
  });

  // Finance — the seeded checklist items, so an age-bracket prompt can resolve
  // to the same UUID FinancialTab keys on (financial_checklist_items.id).
  const financeItems = useQuery({
    queryKey: ["financial-checklist-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_checklist_items")
        .select("id, title");
      if (error) throw error;
      return data ?? [];
    },
  });

  // The parent's progress rows. checklist_item_id is a UUID FK → the items above
  // (types.ts:1869,1901-1908) — never the fin-prompt-* banner dismiss strings.
  const finance = useQuery({
    queryKey: ["parent-financial-checklist", activeChild?.id, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_financial_checklist")
        .select("checklist_item_id, status")
        .eq("parent_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeChild && !!user && !activeChild.is_expected,
  });

  // Health — next scheduled checkup (mirrors VisitPrepCard's query).
  const visit = useQuery({
    queryKey: ["next-steps-visit", activeChild?.id],
    queryFn: async () => {
      const { data: scheduled } = await supabase
        .from("scheduled_visits")
        .select("scheduled_at")
        .eq("child_id", activeChild!.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return scheduled ?? null;
    },
    enabled: !!activeChild,
  });

  // Act-severity milestone flag — the highest-urgency developmental signal.
  // Highest severity is always "act" (we filter to it); oldest-first by
  // first_flagged_at picks the longest-standing one. Un-dismissed only.
  // We respect the SAME retroactive grace-period suppression MilestoneFlags
  // uses so this never fires for a freshly-added older child.
  const actFlag = useQuery({
    queryKey: ["next-steps-act-flag", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestone_flags")
        .select("milestone_id, severity, first_flagged_at, dismissed_at, speech:milestone_id(name)")
        .eq("child_id", activeChild!.id)
        .eq("severity", "act")
        .is("dismissed_at", null)
        .order("first_flagged_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const name = (data.speech as { name: string } | null)?.name ?? null;
      if (!name) return null;
      return { milestoneId: data.milestone_id, name };
    },
    enabled: !!activeChild && !activeChild.is_expected,
  });

  // A re-render trigger for the localStorage-backed milestone dismiss.
  const [dismissTick, setDismissTick] = useState(0);

  const items = useMemo<NextStepItem[]>(() => {
    if (!activeChild) return [];
    const out: NextStepItem[] = [];
    let order = 0;

    // Sleep
    // `now` is captured at mount and intentionally not live — the spec calls for
    // a static "~7 min" at render, no ticking countdown. It refreshes on the next
    // render the surrounding queries trigger, which is the intended granularity.
    const pred = sleep.data?.prediction ?? null;
    if (pred) {
      const s = deriveSleepFeed(now, pred.windowStart, pred.windowEnd);
      if (s) {
        out.push({
          id: "sleep-nap-window",
          domain: "sleep",
          title: s.title,
          meta: s.meta,
          tier: "default",
          deeplink: { kind: "route", target: "/dashboard/sleep" },
          sortHints: { minutesUntil: s.minutesUntil, order: order++ },
        });
      }
    }

    // Health
    if (visit.data?.scheduled_at) {
      const days = differenceInCalendarDays(
        new Date(visit.data.scheduled_at),
        now,
      );
      if (days >= 0) {
        out.push({
          id: "health-checkup",
          domain: "health",
          title: "Checkup coming up",
          meta:
            days === 0
              ? "today"
              : days === 1
                ? "1 day left"
                : `${days} days left`,
          tier: days <= 2 ? "soon" : "default",
          deeplink: { kind: "sheet", target: "visit-prep" },
          sortHints: { daysUntil: days, order: order++ },
        });
      }
    }

    // Finance
    if (!activeChild.is_expected) {
      const ageMonths = getAgeInMonths(
        activeChild.date_of_birth,
        activeChild.is_premature ?? false,
        activeChild.due_date,
      );
      const ageDays = differenceInCalendarDays(
        now,
        new Date(activeChild.date_of_birth),
      );
      const prompt = getFinancePrompt(ageMonths, ageDays);
      const itemId = (financeItems.data ?? []).find(
        (i) => i.title === prompt.seedTitle,
      )?.id;
      // Without a resolved UUID there's no row to suppress against or write to —
      // skip rather than surface a prompt the ✓ can't persist.
      if (itemId) {
        const rows = finance.data ?? [];
        const status = rows.find(
          (r) => r.checklist_item_id === itemId,
        )?.status;
        const locallyDismissed =
          !!user && readFinanceDismissed(user.id).includes(itemId);
        // FinancialTab writes "completed"; snooze/dismiss are localStorage-only.
        const suppressed = status === "completed" || locallyDismissed;
        const insuranceWindow = prompt.bracket === "fin-prompt-0-3";
        const insuranceDaysLeft = Math.max(0, 30 - ageDays);
        // Soft, plan-specific framing — never a guaranteed universal deadline,
        // never a carrier name. The feed's disclaimer footer covers "not advice".
        const insuranceMeta =
          insuranceDaysLeft > 0
            ? `~${insuranceDaysLeft} days left — check your plan`
            : "check your plan's window — it varies";
        if (!suppressed) {
          out.push({
            id: `finance-${itemId}`,
            domain: "finance",
            title: prompt.title,
            meta: insuranceWindow ? insuranceMeta : prompt.meta,
            // The 30-day insurance window is the one time-boxed finance prompt.
            tier: insuranceWindow ? "soon" : "default",
            deeplink: {
              kind: "route",
              target: "/dashboard/records?tab=financial",
            },
            sortHints: insuranceWindow
              ? {
                  daysUntil: insuranceDaysLeft,
                  order: order++,
                }
              : { order: order++ },
          });
        }
      }

      // Recurring annual finance calendar — date-driven, education/reminder
      // only. Evergreen tier (no deadline urgency); the finance domain-dominance
      // cap (≤2 finance in top 3) keeps these from flooding the feed. The
      // birthday nudge carries its days-until so it can lead the other two when
      // it's close. Deep-link to the financial tab where the calendar lives.
      const calendarEvents = getFinanceCalendarEvents(
        now,
        activeChild.date_of_birth,
      );
      for (const event of calendarEvents) {
        if (isFinanceCalendarDismissed(event.type, event.year, activeChild.id)) {
          continue;
        }
        out.push({
          id: `fincal-${event.type}-${event.year}`,
          domain: "finance",
          title: event.title,
          meta: event.meta,
          tier: "default",
          deeplink: {
            kind: "route",
            target: "/dashboard/records?tab=financial",
          },
          sortHints:
            event.type === "birthday-savings"
              ? { daysUntil: event.daysUntil, order: order++ }
              : { order: order++ },
        });
      }
    }

    // Milestone focus drill — celebratory encouragement for an upcoming skill.
    const dismissedMilestones = readMilestoneDismissed(activeChild.id, dayKey);
    const nextMilestone = (milestones.data ?? []).find(
      (m) => !dismissedMilestones.includes(m.id),
    );
    if (nextMilestone) {
      out.push({
        id: `milestone-${nextMilestone.id}`,
        domain: "milestone",
        title: `Coming up: ${nextMilestone.name}`,
        meta: "a skill that may be coming up",
        tier: "default",
        deeplink: {
          kind: "chat",
          target: "developmental",
          seedPrompt: `Give me a simple activity to encourage my baby toward "${nextMilestone.name}".`,
          forceSkill: "developmental",
        },
        sortHints: { order: order++ },
      });
    }

    // Act-severity milestone flag → exactly one redflag item. Suppressed during
    // the new-account retroactive grace period (same gate as MilestoneFlags).
    const inGracePeriod =
      !!activeChild.created_at &&
      isInRetroactiveGracePeriod({
        created_at: activeChild.created_at,
        retroactive_setup_completed_at:
          activeChild.retroactive_setup_completed_at ?? null,
      });
    if (!inGracePeriod && actFlag.data) {
      out.push({
        id: `actflag-${actFlag.data.milestoneId}`,
        domain: "milestone",
        title: "A skill to check in on",
        meta: "free to ask — no diagnosis needed",
        tier: "redflag",
        deeplink: {
          kind: "chat",
          target: "developmental",
          forceSkill: "developmental",
          seedPrompt: `Give me one simple, low-pressure activity using common household items to gently encourage my baby toward "${actFlag.data.name}".`,
        },
        sortHints: { order: order++ },
      });
    }

    return rankNextSteps(out);
    // dismissTick forces recompute after a localStorage milestone dismiss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeChild,
    sleep.data,
    visit.data,
    finance.data,
    financeItems.data,
    milestones.data,
    actFlag.data,
    user,
    dayKey,
    dismissTick,
  ]);

  // ── Write-backs to the source state homes ──────────────────────────────────

  // Marks a financial_checklist_items row "completed" for this parent — the same
  // row and status FinancialTab.toggleItem writes (FinancialTab.tsx:101-119), so
  // a ✓ here flips the same checkbox there. `itemId` is the items-table UUID.
  const completeFinanceItem = useMutation({
    mutationFn: async (itemId: string) => {
      const rows = finance.data ?? [];
      const existing = rows.find((r) => r.checklist_item_id === itemId);
      if (existing) {
        const { error } = await supabase
          .from("parent_financial_checklist")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("parent_id", user!.id)
          .eq("checklist_item_id", itemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("parent_financial_checklist")
          .insert({
            checklist_item_id: itemId,
            parent_id: user!.id,
            status: "completed",
            completed_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Bare key matches FinancialTab's useQuery; our suffixed feed key is
      // prefix-matched by the same invalidation.
      queryClient.invalidateQueries({ queryKey: ["parent-financial-checklist"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save that",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Dismissing the act-flag feed item writes dismissed_at to the SAME
  // milestone_flags row MilestoneFlags owns (upsert shape mirrors
  // MilestoneFlags.dismissFlag) — so clearing it here also clears the card on
  // the Milestones tab. We map this feed action to the existing "seeking_eval"
  // reason ("We're already on it"). Not a localStorage transient: the flag has a
  // real DB home and a shared consumer, so we write to it.
  const dismissActFlag = useMutation({
    mutationFn: async (milestoneId: string) => {
      if (!activeChild) return;
      const { error } = await supabase.from("milestone_flags").upsert(
        {
          child_id: activeChild.id,
          parent_id: user!.id,
          milestone_id: milestoneId,
          severity: "act",
          last_evaluated_at: new Date().toISOString(),
          dismissed_at: new Date().toISOString(),
          dismissed_reason: "seeking_eval",
        },
        { onConflict: "child_id,milestone_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["next-steps-act-flag", activeChild?.id] });
      queryClient.invalidateQueries({ queryKey: ["milestone-flags", activeChild?.id] });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't update that",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const dismissFinanceLocal = useCallback(
    (itemId: string) => {
      if (!user) return;
      const current = readFinanceDismissed(user.id);
      if (!current.includes(itemId)) {
        persistFinanceDismissed(user.id, [...current, itemId]);
      }
      setDismissTick((n) => n + 1);
    },
    [user],
  );

  const dismissMilestoneLocal = useCallback(
    (milestoneId: string) => {
      if (!activeChild) return;
      const current = readMilestoneDismissed(activeChild.id, dayKey);
      persistMilestoneDismissed(activeChild.id, dayKey, [
        ...current,
        milestoneId,
      ]);
      setDismissTick((n) => n + 1);
    },
    [activeChild, dayKey],
  );

  const dismissFinanceCalendarLocal = useCallback(
    (type: FinanceCalendarType, year: number) => {
      if (!activeChild) return;
      persistFinanceCalendarDismissed(type, year, activeChild.id);
      setDismissTick((n) => n + 1);
    },
    [activeChild],
  );

  // finance ids carry the items-table UUID: `finance-<uuid>`.
  // finance-calendar ids carry `fincal-<type>-<year>`.
  const financeItemIdOf = (item: NextStepItem) =>
    item.domain === "finance" && item.id.startsWith("finance-")
      ? item.id.replace(/^finance-/, "")
      : null;
  const financeCalendarOf = (
    item: NextStepItem,
  ): { type: FinanceCalendarType; year: number } | null => {
    if (item.domain !== "finance" || !item.id.startsWith("fincal-")) return null;
    const rest = item.id.replace(/^fincal-/, "");
    const lastDash = rest.lastIndexOf("-");
    if (lastDash < 0) return null;
    const type = rest.slice(0, lastDash) as FinanceCalendarType;
    const year = Number(rest.slice(lastDash + 1));
    if (Number.isNaN(year)) return null;
    return { type, year };
  };
  const milestoneIdOf = (item: NextStepItem) =>
    item.domain === "milestone" && item.id.startsWith("milestone-")
      ? item.id.replace(/^milestone-/, "")
      : null;
  // Act-flag ids carry the milestone UUID: `actflag-<uuid>`. Distinct from the
  // celebratory `milestone-<uuid>` focus drill so the two don't collide.
  const actFlagIdOf = (item: NextStepItem) =>
    item.domain === "milestone" && item.id.startsWith("actflag-")
      ? item.id.replace(/^actflag-/, "")
      : null;

  const complete = useCallback(
    (item: NextStepItem) => {
      const actId = actFlagIdOf(item);
      if (actId) {
        dismissActFlag.mutate(actId);
        return;
      }
      const itemId = financeItemIdOf(item);
      if (itemId) {
        completeFinanceItem.mutate(itemId);
        return;
      }
      const calendar = financeCalendarOf(item);
      if (calendar) {
        // Reminder only — no DB write. Completing clears this occurrence; it
        // recurs next year via the year-keyed dismiss.
        dismissFinanceCalendarLocal(calendar.type, calendar.year);
        return;
      }
      const milestoneId = milestoneIdOf(item);
      if (milestoneId) {
        // No "achieved" write here — the celebratory drill is a suggestion, not
        // an attainment claim. Completing it just clears it for the day.
        dismissMilestoneLocal(milestoneId);
        return;
      }
      // Sleep / health items have no inline "complete" — they route to source.
    },
    [dismissActFlag, completeFinanceItem, dismissFinanceCalendarLocal, dismissMilestoneLocal],
  );

  const snooze = useCallback(
    (item: NextStepItem) => {
      const actId = actFlagIdOf(item);
      if (actId) {
        dismissActFlag.mutate(actId);
        return;
      }
      const itemId = financeItemIdOf(item);
      if (itemId) {
        dismissFinanceLocal(itemId);
        return;
      }
      const calendar = financeCalendarOf(item);
      if (calendar) {
        dismissFinanceCalendarLocal(calendar.type, calendar.year);
        return;
      }
      const milestoneId = milestoneIdOf(item);
      if (milestoneId) dismissMilestoneLocal(milestoneId);
    },
    [dismissActFlag, dismissFinanceLocal, dismissFinanceCalendarLocal, dismissMilestoneLocal],
  );

  const dismiss = useCallback(
    (item: NextStepItem) => {
      const actId = actFlagIdOf(item);
      if (actId) {
        dismissActFlag.mutate(actId);
        return;
      }
      const itemId = financeItemIdOf(item);
      if (itemId) {
        dismissFinanceLocal(itemId);
        return;
      }
      const calendar = financeCalendarOf(item);
      if (calendar) {
        dismissFinanceCalendarLocal(calendar.type, calendar.year);
        return;
      }
      const milestoneId = milestoneIdOf(item);
      if (milestoneId) dismissMilestoneLocal(milestoneId);
    },
    [dismissActFlag, dismissFinanceLocal, dismissFinanceCalendarLocal, dismissMilestoneLocal],
  );

  const isLoading =
    !!activeChild &&
    (sleep.isLoading ||
      milestones.isLoading ||
      finance.isLoading ||
      financeItems.isLoading ||
      actFlag.isLoading ||
      visit.isLoading);

  const isError =
    sleep.isError ||
    milestones.isError ||
    finance.isError ||
    financeItems.isError ||
    actFlag.isError ||
    visit.isError;

  return { items, isLoading, isError, complete, snooze, dismiss };
}
