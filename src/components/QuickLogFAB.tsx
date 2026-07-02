import { Plus, Moon, UtensilsCrossed, Droplets, Brain, TrendingUp, ArrowRight, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { VoiceQuickLog } from "@/components/VoiceQuickLog";

type SheetCategory = "sleep" | "feeding" | "diaper";

const quickActions = [
  { label: "Sleep", icon: Moon, category: "sleep" as const, color: "bg-sleep text-white" },
  { label: "Food", icon: UtensilsCrossed, category: "feeding" as const, color: "bg-feeding text-white" },
  { label: "Diaper", icon: Droplets, category: "diaper" as const, color: "bg-diapers text-white" },
];

const TIME_AGO_OPTIONS = [
  { label: "Now", value: 0 },
  { label: "15m ago", value: 15 },
  { label: "30m ago", value: 30 },
  { label: "1h ago", value: 60 },
];

const chipTones = {
  sleep: { selected: "bg-sleep text-white", idle: "bg-sleep-bg/60 text-sleep hover:bg-sleep-bg" },
  feeding: { selected: "bg-feeding text-white", idle: "bg-feeding-bg/60 text-feeding hover:bg-feeding-bg" },
} as const;

function TimeAgoChips({
  label,
  tone,
  value,
  onChange,
}: {
  label: string;
  tone: keyof typeof chipTones;
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {TIME_AGO_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className={cn(
                "px-3 min-h-[48px] min-w-[48px] rounded-full text-sm font-semibold transition-colors",
                selected ? chipTones[tone].selected : chipTones[tone].idle
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export function QuickLogFAB() {
  const [open, setOpen] = useState(false);
  const [sheetCategory, setSheetCategory] = useState<SheetCategory | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const navigate = useNavigate();

  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    longPressFired.current = false;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longPressFired.current = true;
      setOpen(false);
      setVoiceOpen(true);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pressTimer.current === null || !pressOrigin.current) return;
    const dx = e.clientX - pressOrigin.current.x;
    const dy = e.clientY - pressOrigin.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) clearPressTimer();
  };

  const handleFabClick = () => {
    // A click always follows pointerup, including after a completed long
    // press — swallow that one so the hold doesn't also toggle the menu.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setOpen(!open);
  };

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

        {/* Main FAB — tap opens the menu, hold to log by voice */}
        <button
          onClick={handleFabClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearPressTimer}
          onPointerLeave={clearPressTimer}
          onPointerCancel={clearPressTimer}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={open ? "Close quick log menu" : "Open quick log menu — hold to log by voice"}
          aria-expanded={open}
          className={cn(
            "w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center transition-all active:scale-95 touch-none select-none",
            open ? "rotate-45" : "animate-fab-pulse"
          )}
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </button>
      </div>

      <QuickLogSheet category={sheetCategory} onClose={() => setSheetCategory(null)} />
      <VoiceQuickLog open={voiceOpen} onOpenChange={setVoiceOpen} />
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
  return () => invalidateAfterLogWrite(queryClient);
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
  const [endedAgoMin, setEndedAgoMin] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeChild || !user) throw new Error("No active child");
      const mins = parseInt(minutes, 10);
      if (!mins || mins <= 0) throw new Error("Enter a duration in minutes");
      const endedAt = new Date(Date.now() - endedAgoMin * 60_000);
      const { error } = await supabase.from("sleep_logs").insert({
        child_id: activeChild.id,
        parent_id: user.id,
        sleep_type: sleepType,
        started_at: new Date(endedAt.getTime() - mins * 60_000).toISOString(),
        ended_at: endedAt.toISOString(),
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
      <TimeAgoChips label="Ended" tone="sleep" value={endedAgoMin} onChange={setEndedAgoMin} />
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
  const [fedAgoMin, setFedAgoMin] = useState(0);
  const [sideChoice, setSideChoice] = useState<"left" | "right" | null>(null);

  const { data: lastSide } = useQuery({
    queryKey: ["last-nursing-side", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feeding_logs")
        .select("side")
        .eq("child_id", activeChild!.id)
        .eq("feeding_type", "breast")
        .not("side", "is", null)
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.side ?? null;
    },
    enabled: !!activeChild,
  });

  const suggestedSide = lastSide === "left" ? "right" : lastSide === "right" ? "left" : null;
  const side = sideChoice ?? suggestedSide;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeChild || !user) throw new Error("No active child");
      const payload: TablesInsert<"feeding_logs"> = {
        child_id: activeChild.id,
        parent_id: user.id,
        feeding_type: feedingType,
        logged_at: new Date(Date.now() - fedAgoMin * 60_000).toISOString(),
      };
      if (feedingType === "bottle" && oz) payload.amount_oz = parseFloat(oz);
      if (feedingType === "breast" && duration) payload.duration_minutes = parseInt(duration, 10);
      if (feedingType === "breast" && side) payload.side = side;
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
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Side</Label>
            <div className="flex gap-2">
              {(["left", "right"] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={side === s ? "default" : "outline"}
                  className={cn("flex-1 capitalize min-h-[48px]", side === s && "bg-feeding hover:bg-feeding/90")}
                  onClick={() => setSideChoice(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            {(lastSide === "left" || lastSide === "right") && (
              <p className="text-xs text-muted-foreground">
                Last time: <span className="capitalize">{lastSide}</span>
                {suggestedSide && !sideChoice && (
                  <>
                    {" — starting "}
                    <span className="capitalize">{suggestedSide}</span>
                  </>
                )}
              </p>
            )}
            {lastSide === "both" && (
              <p className="text-xs text-muted-foreground">Last time: both sides</p>
            )}
          </div>
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
        </>
      )}
      <TimeAgoChips label="Fed" tone="feeding" value={fedAgoMin} onChange={setFedAgoMin} />
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
  // "both" matches DiapersPage's vocabulary — it counts toward wet AND dirty
  // totals there; the FAB previously wrote "mixed", which counted as neither.
  const [diaperType, setDiaperType] = useState<"wet" | "dirty" | "both">("wet");

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
        {(["wet", "dirty", "both"] as const).map((t) => (
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
