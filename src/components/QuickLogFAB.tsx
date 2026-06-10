import { Plus, Moon, UtensilsCrossed, Droplets, Brain, TrendingUp, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type SheetCategory = "sleep" | "feeding" | "diaper";

const quickActions = [
  { label: "Sleep", icon: Moon, category: "sleep" as const, color: "bg-sleep text-white" },
  { label: "Food", icon: UtensilsCrossed, category: "feeding" as const, color: "bg-feeding text-white" },
  { label: "Diaper", icon: Droplets, category: "diaper" as const, color: "bg-diapers text-white" },
];

const INVALIDATE_KEYS = [
  "sleep-logs",
  "today-sleep",
  "today-feeds",
  "today-diapers",
  "streak",
  "activity-feed",
  "feeding-logs",
  "diaper-logs",
  "analytics-month",
];

export function QuickLogFAB() {
  const [open, setOpen] = useState(false);
  const [sheetCategory, setSheetCategory] = useState<SheetCategory | null>(null);
  const navigate = useNavigate();

  const handleAction = (category: SheetCategory) => {
    setOpen(false);
    setSheetCategory(category);
  };

  return (
    <>
      <div className="fixed bottom-[calc(var(--tab-bar-height)+1rem)] right-4 z-50 flex flex-col items-end gap-3">
        {/* Expanded actions */}
        {open && (
          <div className="flex flex-col gap-2 items-end animate-in slide-in-from-bottom-2 fade-in duration-200">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleAction(action.category)}
                className={cn(
                  "flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full shadow-lg touch-target font-semibold text-sm transition-transform active:scale-95",
                  action.color
                )}
              >
                {action.label}
                <action.icon className="w-5 h-5" />
              </button>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                navigate("/dashboard/milestones");
              }}
              className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full shadow-lg touch-target font-semibold text-sm transition-transform active:scale-95 bg-milestones text-white"
            >
              Milestones
              <Brain className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setOpen(false);
                navigate("/dashboard/growth");
              }}
              className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full shadow-lg touch-target font-semibold text-sm transition-transform active:scale-95 bg-primary text-primary-foreground"
            >
              Growth
              <TrendingUp className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Main FAB */}
        <button
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close quick log menu" : "Open quick log menu"}
          aria-expanded={open}
          className={cn(
            "w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center transition-all active:scale-95",
            open ? "rotate-45" : "animate-fab-pulse"
          )}
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </button>
      </div>

      <QuickLogSheet category={sheetCategory} onClose={() => setSheetCategory(null)} />
    </>
  );
}

function QuickLogSheet({ category, onClose }: { category: SheetCategory | null; onClose: () => void }) {
  return (
    <Sheet open={!!category} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-w-lg mx-auto p-0">
        {category === "sleep" && <SleepQuickLog onDone={onClose} />}
        {category === "feeding" && <FeedingQuickLog onDone={onClose} />}
        {category === "diaper" && <DiaperQuickLog onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function useQuickLogInvalidate() {
  const queryClient = useQueryClient();
  return () => INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

function FormShell({
  title,
  children,
  morePath,
  morePathLabel,
}: {
  title: string;
  children: React.ReactNode;
  morePath: string;
  morePathLabel: string;
}) {
  return (
    <div className="p-5 pb-6 space-y-4">
      <SheetHeader className="text-left space-y-1">
        <SheetTitle className="font-display">{title}</SheetTitle>
      </SheetHeader>
      {children}
      <Link
        to={morePath}
        className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {morePathLabel} <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function SleepQuickLog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const invalidate = useQuickLogInvalidate();
  const [sleepType, setSleepType] = useState<"nap" | "night">("nap");
  const [minutes, setMinutes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeChild || !user) throw new Error("No active child");
      const mins = parseInt(minutes, 10);
      if (!mins || mins <= 0) throw new Error("Enter a duration in minutes");
      const now = new Date();
      const { error } = await supabase.from("sleep_logs").insert({
        child_id: activeChild.id,
        parent_id: user.id,
        sleep_type: sleepType,
        started_at: new Date(now.getTime() - mins * 60_000).toISOString(),
        ended_at: now.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: sleepType === "nap" ? "Nap logged ☀️" : "Night sleep logged 🌙" });
      onDone();
    },
    onError: (e) => {
      toast({ title: "Couldn't log sleep", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    },
  });

  return (
    <FormShell title="Log sleep" morePath="/dashboard/sleep" morePathLabel="More sleep options">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={sleepType === "nap" ? "default" : "outline"}
          className="flex-1 gap-1.5"
          onClick={() => setSleepType("nap")}
        >
          <Moon className="w-4 h-4" /> Nap
        </Button>
        <Button
          type="button"
          variant={sleepType === "night" ? "default" : "outline"}
          className="flex-1 gap-1.5"
          onClick={() => setSleepType("night")}
        >
          <Moon className="w-4 h-4" /> Night
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qlog-sleep-min" className="text-xs">Duration (minutes)</Label>
        <Input
          id="qlog-sleep-min"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="e.g. 90"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      <Button
        className="w-full"
        disabled={mutation.isPending || !minutes}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
      </Button>
    </FormShell>
  );
}

function FeedingQuickLog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const invalidate = useQuickLogInvalidate();
  const { prefs, setPrefs } = usePreferences();
  const [feedingType, setFeedingType] = useState<"bottle" | "breast" | "solid">(prefs.lastFeedingType);
  const [oz, setOz] = useState(prefs.lastBottleOz);
  const [duration, setDuration] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeChild || !user) throw new Error("No active child");
      const payload: TablesInsert<"feeding_logs"> = {
        child_id: activeChild.id,
        parent_id: user.id,
        feeding_type: feedingType,
        logged_at: new Date().toISOString(),
      };
      if (feedingType === "bottle" && oz) payload.amount_oz = parseFloat(oz);
      if (feedingType === "breast" && duration) payload.duration_minutes = parseInt(duration, 10);
      const { error } = await supabase.from("feeding_logs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setPrefs(
        feedingType === "bottle" && oz
          ? { lastFeedingType: feedingType, lastBottleOz: oz }
          : { lastFeedingType: feedingType }
      );
      toast({ title: "Feeding logged 🍼" });
      onDone();
    },
    onError: (e) => {
      toast({ title: "Couldn't log feeding", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    },
  });

  return (
    <FormShell title="Log feeding" morePath="/dashboard/feeding" morePathLabel="More feeding options">
      <div className="flex gap-2">
        {(["bottle", "breast", "solid"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            variant={feedingType === t ? "default" : "outline"}
            className="flex-1 capitalize"
            onClick={() => setFeedingType(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {feedingType === "bottle" && (
        <div className="space-y-1.5">
          <Label htmlFor="qlog-feed-oz" className="text-xs">Amount (oz)</Label>
          <Input
            id="qlog-feed-oz"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            placeholder="e.g. 4"
            value={oz}
            onChange={(e) => setOz(e.target.value)}
          />
        </div>
      )}
      {feedingType === "breast" && (
        <div className="space-y-1.5">
          <Label htmlFor="qlog-feed-min" className="text-xs">Duration (minutes, optional)</Label>
          <Input
            id="qlog-feed-min"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="e.g. 15"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
      )}
      <Button
        className="w-full"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
      </Button>
    </FormShell>
  );
}

function DiaperQuickLog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const invalidate = useQuickLogInvalidate();
  const [diaperType, setDiaperType] = useState<"wet" | "dirty" | "mixed">("wet");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeChild || !user) throw new Error("No active child");
      const { error } = await supabase.from("diaper_logs").insert({
        child_id: activeChild.id,
        parent_id: user.id,
        diaper_type: diaperType,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Diaper logged 🧷" });
      onDone();
    },
    onError: (e) => {
      toast({ title: "Couldn't log diaper", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    },
  });

  return (
    <FormShell title="Log diaper" morePath="/dashboard/diapers" morePathLabel="More diaper options">
      <div className="flex gap-2">
        {(["wet", "dirty", "mixed"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            variant={diaperType === t ? "default" : "outline"}
            className="flex-1 capitalize"
            onClick={() => setDiaperType(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
      </Button>
    </FormShell>
  );
}
