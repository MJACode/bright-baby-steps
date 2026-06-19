import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, differenceInMinutes, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAgeInMonths } from "@/hooks/useChildren";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import { useSleepPlan } from "@/hooks/useSleepPlan";
import { toast } from "@/hooks/use-toast";
import { rankNextSteps, type NextStepItem } from "@/lib/nextSteps";

interface ChildLite {
  id: string;
  name: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
  next_appointment?: string | null;
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
      meta: "most plans give you a 30-day window",
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
      seedTitle: "Open a 529 college savings plan",
      title: "Compare ways to start saving for your child",
      meta: "529, UGMA, custodial Roth and more",
    };
  return {
    bracket: "fin-prompt-12",
    seedTitle: "Review your life insurance coverage",
    title: "Look into life insurance for your family",
    meta: "a term policy brings peace of mind",
  };
}

const MILESTONE_LOOKAHEAD_MONTHS = 4;

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

  // Milestones — "coming up" = typical-start within the next ~4 months and not
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
        if (!suppressed) {
          out.push({
            id: `finance-${itemId}`,
            domain: "finance",
            title: prompt.title,
            meta: prompt.meta,
            // The 30-day insurance window is the one time-boxed finance prompt.
            tier: insuranceWindow ? "soon" : "default",
            deeplink: {
              kind: "route",
              target: "/dashboard/records?tab=financial",
            },
            sortHints: insuranceWindow
              ? {
                  daysUntil: Math.max(0, 30 - ageDays),
                  order: order++,
                }
              : { order: order++ },
          });
        }
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
        title: `Encourage ${nextMilestone.name.toLowerCase()}`,
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

  // finance ids carry the items-table UUID: `finance-<uuid>`.
  const financeItemIdOf = (item: NextStepItem) =>
    item.domain === "finance" ? item.id.replace(/^finance-/, "") : null;
  const milestoneIdOf = (item: NextStepItem) =>
    item.domain === "milestone" ? item.id.replace(/^milestone-/, "") : null;

  const complete = useCallback(
    (item: NextStepItem) => {
      const itemId = financeItemIdOf(item);
      if (itemId) {
        completeFinanceItem.mutate(itemId);
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
    [completeFinanceItem, dismissMilestoneLocal],
  );

  const snooze = useCallback(
    (item: NextStepItem) => {
      const itemId = financeItemIdOf(item);
      if (itemId) {
        dismissFinanceLocal(itemId);
        return;
      }
      const milestoneId = milestoneIdOf(item);
      if (milestoneId) dismissMilestoneLocal(milestoneId);
    },
    [dismissFinanceLocal, dismissMilestoneLocal],
  );

  const dismiss = useCallback(
    (item: NextStepItem) => {
      const itemId = financeItemIdOf(item);
      if (itemId) {
        dismissFinanceLocal(itemId);
        return;
      }
      const milestoneId = milestoneIdOf(item);
      if (milestoneId) dismissMilestoneLocal(milestoneId);
    },
    [dismissFinanceLocal, dismissMilestoneLocal],
  );

  const isLoading =
    !!activeChild &&
    (sleep.isLoading ||
      milestones.isLoading ||
      finance.isLoading ||
      financeItems.isLoading ||
      visit.isLoading);

  const isError =
    sleep.isError ||
    milestones.isError ||
    finance.isError ||
    financeItems.isError ||
    visit.isError;

  return { items, isLoading, isError, complete, snooze, dismiss };
}
