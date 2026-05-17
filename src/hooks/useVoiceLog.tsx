// Wraps `useSpeechRecognition` with a state machine for the voice-log flow:
//   idle -> listening -> parsing -> review -> saving -> done
//
// Calls the `parse-voice-log` edge function and exposes the parsed entries
// for the user to confirm before they're written to the DB.
//
// Schema-aligned save: this hook writes directly to feeding_logs / sleep_logs
// / diaper_logs / custom_milestones using the actual column names. The edge
// function's SYSTEM_PROMPT is configured to return matching field names.

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export type VoiceLogState =
  | "idle"
  | "listening"
  | "parsing"
  | "review"
  | "saving"
  | "done"
  | "error";

export type ParsedEntry = {
  type: "feeding" | "sleep" | "diaper" | "milestone";
  occurred_at: string;
  fields: Record<string, unknown>;
  confidence: number;
  summary: string;
};

export type ParseResult = {
  entries: ParsedEntry[];
  ambiguous?: string[];
};

interface UseVoiceLogOptions {
  childContext?: string;
  onSaved?: (entries: ParsedEntry[]) => void;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function useVoiceLog({ childContext, onSaved }: UseVoiceLogOptions = {}) {
  const [state, setState] = useState<VoiceLogState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const speech = useSpeechRecognition({
    onResult: (final) => {
      setTranscript(final);
      void parseTranscript(final);
    },
    onInterim: (text) => setInterim(text),
  });

  const parseTranscript = useCallback(
    async (text: string) => {
      setState("parsing");
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("parse-voice-log", {
          body: {
            transcript: text,
            now: new Date().toISOString(),
            childContext,
          },
        });

        if (fnError) throw fnError;
        if (!data || !Array.isArray(data.entries)) {
          throw new Error("Couldn't understand. Try again?");
        }

        setParsed(data as ParseResult);
        setState("review");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setState("error");
      }
    },
    [childContext]
  );

  const start = useCallback(async () => {
    setError(null);
    setTranscript("");
    setInterim("");
    setParsed(null);
    setState("listening");
    await speech.start();
  }, [speech]);

  const stop = useCallback(async () => {
    await speech.stop();
  }, [speech]);

  const cancel = useCallback(() => {
    void speech.stop();
    setState("idle");
    setTranscript("");
    setInterim("");
    setParsed(null);
    setError(null);
  }, [speech]);

  const save = useCallback(
    async (entries: ParsedEntry[], childId: string) => {
      setState("saving");
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error("Not signed in");

        for (const entry of entries) {
          const occurred = entry.occurred_at || new Date().toISOString();
          const f = entry.fields ?? {};

          if (entry.type === "feeding") {
            const feedingType = asString(f.feeding_type) ?? "bottle_formula";
            const { error: insErr } = await supabase.from("feeding_logs").insert({
              child_id: childId,
              parent_id: userId,
              logged_at: occurred,
              feeding_type: feedingType,
              amount_oz: asNumber(f.amount_oz),
              duration_minutes: asNumber(f.duration_minutes),
              side: asString(f.side),
              food_description: asString(f.food_description),
              notes: entry.summary,
              source: "voice",
            });
            if (insErr) throw insErr;
          } else if (entry.type === "sleep") {
            const startedAt = asString(f.started_at) ?? occurred;
            const explicitEnd = asString(f.ended_at);
            const duration = asNumber(f.duration_minutes);
            // duration_minutes on sleep_logs is generated from (ended_at - started_at).
            // If the parse only gave us a duration, derive ended_at from start + duration
            // so the row carries an end time (and the generated column gets populated).
            const endedAt =
              explicitEnd ??
              (duration
                ? new Date(new Date(startedAt).getTime() + duration * 60_000).toISOString()
                : null);
            const sleepType = asString(f.sleep_type) ?? "nap";
            const quality = asString(f.quality);
            const { error: insErr } = await supabase.from("sleep_logs").insert({
              child_id: childId,
              parent_id: userId,
              started_at: startedAt,
              ended_at: endedAt,
              sleep_type: sleepType,
              quality,
              notes: entry.summary,
              source: "voice",
            });
            if (insErr) throw insErr;
          } else if (entry.type === "diaper") {
            const diaperType = asString(f.diaper_type) ?? "wet";
            const { error: insErr } = await supabase.from("diaper_logs").insert({
              child_id: childId,
              parent_id: userId,
              logged_at: occurred,
              diaper_type: diaperType,
              notes: entry.summary,
              source: "voice",
            });
            if (insErr) throw insErr;
          } else if (entry.type === "milestone") {
            const name = asString(f.name) ?? entry.summary;
            const achievedAt = asString(f.achieved_at) ?? occurred.slice(0, 10);
            const { error: insErr } = await supabase.from("custom_milestones").insert({
              child_id: childId,
              parent_id: userId,
              name,
              achieved_at: achievedAt,
              notes: asString(f.notes) ?? null,
              source: "voice",
            });
            if (insErr) throw insErr;
          }
        }

        setState("done");
        onSaved?.(entries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        setState("error");
      }
    },
    [onSaved]
  );

  return {
    state,
    transcript,
    interim,
    parsed,
    error,
    isSupported: speech.isSupported,
    isListening: speech.isListening,
    start,
    stop,
    cancel,
    save,
    reset: cancel,
  };
}
