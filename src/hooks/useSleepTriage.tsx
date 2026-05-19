import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSleepCoach } from "@/hooks/useSleepCoach";
import {
  detectTriageReasons,
  getAgeBucket,
  lookupContent,
  TRIAGE_REASON_HUMAN,
  type AgeBucket,
  type MethodFlavor,
  type TriageContent,
  type TriageReason,
} from "@/lib/sleepTriage";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

interface UseSleepTriageResult {
  detected: TriageReason[];
  selected: TriageReason | null;
  setSelected: (r: TriageReason | null) => void;
  ageMonths: number;
  ageBucket: AgeBucket;
  methodFlavor: MethodFlavor;
  content: TriageContent | null;
  writeMemory: () => Promise<void>;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isReady: boolean;
}

const collapsedKey = (uid: string) => `sleep_triage_collapsed_${uid}`;

function loadCollapsed(uid: string | undefined): boolean {
  if (!uid) return false;
  try {
    const raw = localStorage.getItem(collapsedKey(uid));
    return raw === "1";
  } catch {
    return false;
  }
}

function persistCollapsed(uid: string | undefined, value: boolean) {
  if (!uid) return;
  try {
    localStorage.setItem(collapsedKey(uid), value ? "1" : "0");
  } catch {
    // localStorage may be disabled (private browsing / quota) — best effort only.
  }
}

export function useSleepTriage(activeChild: ChildLite | null): UseSleepTriageResult {
  const { user } = useAuth();
  const { data: coach } = useSleepCoach(activeChild);

  const [selected, setSelected] = useState<TriageReason | null>(null);
  const [collapsed, setCollapsedState] = useState<boolean>(() => loadCollapsed(user?.id));

  useEffect(() => {
    // When the user (or stored prefs) hydrates after mount, reconcile.
    setCollapsedState(loadCollapsed(user?.id));
  }, [user?.id]);

  // Reset selection when the active child changes — pain points are per-child.
  useEffect(() => {
    setSelected(null);
  }, [activeChild?.id]);

  const setCollapsed = useCallback(
    (v: boolean) => {
      setCollapsedState(v);
      persistCollapsed(user?.id, v);
    },
    [user?.id],
  );

  const ageMonths = coach?.ageMonths ?? 0;
  const ageBucket = useMemo(() => getAgeBucket(ageMonths), [ageMonths]);
  // Method flavor is hard-coded 'neutral' for v1. When `profiles.sleep_method`
  // ships from tasks/plan-sleep-coach-v2.md, flip this to read the column.
  const methodFlavor: MethodFlavor = "neutral";

  const detected = useMemo(() => {
    if (!coach) return [];
    return detectTriageReasons(coach.logs, coach.ageMonths);
  }, [coach]);

  const content = useMemo(() => {
    if (!selected) return null;
    return lookupContent(selected, ageBucket, methodFlavor);
  }, [selected, ageBucket, methodFlavor]);

  const writeMemory = useCallback(async () => {
    if (!selected || !activeChild || !user) return;
    try {
      const { error } = await supabase.from("child_memories").insert({
        child_id: activeChild.id,
        category: "concern",
        content: `Currently struggling with: ${TRIAGE_REASON_HUMAN[selected]}`,
        source_function: "sleep-triage",
        confidence: 1.0,
        pinned: false,
        created_by: user.id,
      });
      if (error) throw error;
    } catch (err) {
      // Memory write is a background hint, not a user-visible action. The 30-day
      // dedupe trigger may also return a soft "skipped" — both are non-fatal.
      console.warn("sleep-triage memory write failed", err);
    }
  }, [selected, activeChild, user]);

  return {
    detected,
    selected,
    setSelected,
    ageMonths,
    ageBucket,
    methodFlavor,
    content,
    writeMemory,
    collapsed,
    setCollapsed,
    isReady: !!coach,
  };
}
