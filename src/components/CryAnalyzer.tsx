// Page-level component: hold-to-record UI, live waveform, then a result card
// with the suggestion bucket, confidence, tips, and "log this" CTAs.
//
// Premium-gated at the route level (CryAnalyzerPage wraps with PremiumGate).
//
// Adapted from the handoff to use this repo's `useChildren()` hook and to
// write `parent_id` instead of `logged_by`.

import { useEffect, useState } from "react";
import { Mic, Square, RotateCcw, Info, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCryAnalyzer } from "@/hooks/useCryAnalyzer";
import { BUCKET_LABELS, type CryBucket } from "@/lib/cryFeatures";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/hooks/useChildren";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import { useCryAnalyses } from "@/hooks/useCryAnalyses";
import { formatDistanceToNowStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

const MAX_MS = 8000;

export function CryAnalyzer() {
  const { state, result, error, level, elapsedMs, start, stop, reset } =
    useCryAnalyzer({ maxDurationMs: MAX_MS });
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    if (state !== "result") setLogged(false);
  }, [state]);

  const logResult = async () => {
    if (!result || !activeChild) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { error: insErr } = await supabase.from("cry_analyses").insert({
      child_id: activeChild.id,
      parent_id: userId,
      bucket: result.bucket,
      confidence: result.confidence,
      features: result.features as unknown as Json,
      occurred_at: new Date().toISOString(),
    });
    if (insErr) {
      toast({ title: "Couldn't save", description: insErr.message, variant: "destructive" });
      return;
    }
    setLogged(true);
    queryClient.invalidateQueries({ queryKey: ["cry-analyses", activeChild.id] });
    toast({ title: "Logged" });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl">Listen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hold the mic and let baby do the talking. We'll suggest what might be going on. Logged cries appear in the list below.
        </p>
      </div>

      <div className="rounded-2xl bg-muted/60 p-3 flex gap-2 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Not a medical tool. Trust your instincts — when in doubt, call your pediatrician.
        </p>
      </div>

      {(state === "idle" || state === "recording") && (
        <RecorderView
          state={state}
          level={level}
          elapsedMs={elapsedMs}
          maxMs={MAX_MS}
          onStart={start}
          onStop={stop}
        />
      )}

      {state === "analyzing" && (
        <div className="rounded-3xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing…</p>
        </div>
      )}

      {state === "result" && result && (
        <ResultView
          bucket={result.bucket}
          confidence={result.confidence}
          alternates={result.alternates}
          onRedo={reset}
          onLog={logResult}
          logged={logged}
        />
      )}

      {state === "error" && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-3">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-center">{error}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      )}

      <CryHistoryList childId={activeChild?.id} />
    </div>
  );
}

function CryHistoryList({ childId }: { childId: string | undefined }) {
  const { list, remove } = useCryAnalyses(childId, 10);

  if (!childId) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-display text-base">Recent cries</h2>
      {list.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !list.data || list.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Cries you log will show up here.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.data.map((row) => {
            const bucketKey = (row.user_correction ?? row.bucket) as CryBucket;
            const meta = BUCKET_LABELS[bucketKey] ?? BUCKET_LABELS.unknown;
            const pct = Math.round(row.confidence * 100);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-3"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: `hsl(var(--${meta.color}) / 0.15)` }}
                >
                  {meta.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {meta.title.replace(/^Sounds like |^Could be /, "")}
                    {row.user_correction && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        corrected
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(row.occurred_at), { addSuffix: true })}
                    {" · "}
                    {pct}% confident
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground touch-target shrink-0"
                  onClick={() => remove.mutate(row.id)}
                  disabled={remove.isPending}
                  aria-label="Delete cry"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecorderView({
  state,
  level,
  elapsedMs,
  maxMs,
  onStart,
  onStop,
}: {
  state: "idle" | "recording";
  level: number;
  elapsedMs: number;
  maxMs: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRec = state === "recording";
  const remaining = Math.max(0, maxMs - elapsedMs) / 1000;

  return (
    <div className="rounded-3xl border border-border bg-card p-8 flex flex-col items-center gap-6">
      <button
        onClick={isRec ? onStop : onStart}
        aria-label={isRec ? "Stop" : "Start"}
        className={cn(
          "relative w-28 h-28 rounded-full flex items-center justify-center transition-all",
          isRec
            ? "bg-destructive text-destructive-foreground"
            : "bg-primary text-primary-foreground active:scale-95"
        )}
        style={
          isRec
            ? { boxShadow: `0 0 0 ${8 + level * 40}px hsl(var(--destructive) / 0.15)` }
            : undefined
        }
      >
        {isRec ? (
          <Square className="w-10 h-10" fill="currentColor" />
        ) : (
          <Mic className="w-10 h-10" strokeWidth={2.25} />
        )}
      </button>

      {isRec ? (
        <>
          <Waveform level={level} />
          <p className="text-xs text-muted-foreground">
            Listening… {remaining.toFixed(1)}s left
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Tap to record up to 8 seconds. Closer to baby = better.
        </p>
      )}
    </div>
  );
}

function Waveform({ level }: { level: number }) {
  const bars = Array.from({ length: 24 }, (_, i) => {
    const distance = Math.abs(i - 12) / 12;
    const h = Math.max(6, level * 100 * (1 - distance * 0.6));
    return h;
  });
  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-primary transition-all duration-75"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function ResultView({
  bucket,
  confidence,
  alternates,
  onRedo,
  onLog,
  logged,
}: {
  bucket: CryBucket;
  confidence: number;
  alternates: { bucket: CryBucket; confidence: number }[];
  onRedo: () => void;
  onLog: () => void;
  logged: boolean;
}) {
  const meta = BUCKET_LABELS[bucket];
  const pct = Math.round(confidence * 100);

  return (
    <div className="space-y-4">
      <div
        className="rounded-3xl p-6 text-card-foreground"
        style={{
          backgroundColor: `hsl(var(--${meta.color}) / 0.08)`,
          border: `1px solid hsl(var(--${meta.color}) / 0.25)`,
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
            style={{ backgroundColor: `hsl(var(--${meta.color}) / 0.15)` }}
          >
            {meta.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-60">
              Suggestion
            </p>
            <h2 className="font-display text-2xl mt-0.5">{meta.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              About {pct}% confident
              {alternates.length > 0 && (
                <>
                  {" "}· could also be{" "}
                  {alternates
                    .slice(0, 2)
                    .map((a) =>
                      BUCKET_LABELS[a.bucket].title
                        .replace("Sounds like ", "")
                        .replace("Could be ", "")
                    )
                    .join(" or ")}
                </>
              )}
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {meta.tips.map((tip, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">·</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onRedo}>
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Listen again
        </Button>
        <Button className="flex-1" onClick={onLog} disabled={logged}>
          {logged ? "Logged ✓" : "Log this"}
        </Button>
      </div>
    </div>
  );
}
