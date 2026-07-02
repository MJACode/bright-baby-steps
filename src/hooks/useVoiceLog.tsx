// Wraps `useSpeechRecognition` with a state machine for the voice-log flow:
//   idle -> listening -> parsing -> review -> saving -> done
//
// Calls the `parse-voice-log` edge function and exposes the parsed entries
// for the user to confirm before they're written to the DB.
//
// Fast path: a parse that returns exactly one entry with confidence >= 0.9
// and nothing in `ambiguous` is saved immediately, skipping review. The
// caller gets the inserted row ids via `onSaved` so it can offer undo.
//
// Schema-aligned save: this hook writes directly to feeding_logs / sleep_logs
// / diaper_logs / custom_milestones using the actual column names. The edge
// function's SYSTEM_PROMPT is configured to return matching field names.

import { useCallback, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
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
  type: "feeding" | "sleep" | "diaper" | "milestone" | "temperature";
  occurred_at: string;
  fields: Record<string, unknown>;
  confidence: number;
  summary: string;
  edited?: boolean;
};

export type ParseResult = {
  entries: ParsedEntry[];
  ambiguous?: string[];
};

export type SavedRow = {
  table: "feeding_logs" | "sleep_logs" | "diaper_logs" | "custom_milestones" | "temperature_logs";
  id: string;
};

export type SaveOutcome = {
  fastPath: boolean;
  savedRows: SavedRow[];
};

const FAST_PATH_CONFIDENCE = 0.9;

// Types `save` actually inserts. The edge function is prompted to return only
// these, but the parse is untrusted input — anything else would fall through
// save's if/else chain with zero rows written, so it must go to review, not
// the auto-save toast.
const SAVEABLE_TYPES: ReadonlyArray<ParsedEntry["type"]> = [
  "feeding",
  "sleep",
  "diaper",
  "milestone",
  "temperature",
];

interface UseVoiceLogOptions {
  childContext?: string;
  childId?: string;
  onSaved?: (entries: ParsedEntry[], outcome: SaveOutcome) => void;
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

export function useVoiceLog({ childContext, childId, onSaved }: UseVoiceLogOptions = {}) {
  const [state, setState] = useState<VoiceLogState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (entries: ParsedEntry[], targetChildId: string, opts: { fastPath?: boolean } = {}) => {
      setState("saving");
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error("Not signed in");

        const savedRows: SavedRow[] = [];

        for (const entry of entries) {
          const occurred = entry.occurred_at || new Date().toISOString();
          const f = entry.fields ?? {};

          if (entry.type === "feeding") {
            const feedingType = asString(f.feeding_type) ?? "bottle_formula";
            const { data: ins, error: insErr } = await supabase
              .from("feeding_logs")
              .insert({
                child_id: targetChildId,
                parent_id: userId,
                logged_at: occurred,
                feeding_type: feedingType,
                amount_oz: asNumber(f.amount_oz),
                duration_minutes: asNumber(f.duration_minutes),
                side: asString(f.side),
                food_description: asString(f.food_description),
                notes: entry.summary,
                source: "voice",
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            savedRows.push({ table: "feeding_logs", id: ins.id });
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
            const { data: ins, error: insErr } = await supabase
              .from("sleep_logs")
              .insert({
                child_id: targetChildId,
                parent_id: userId,
                started_at: startedAt,
                ended_at: endedAt,
                sleep_type: sleepType,
                quality,
                notes: entry.summary,
                source: "voice",
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            savedRows.push({ table: "sleep_logs", id: ins.id });
          } else if (entry.type === "diaper") {
            const diaperType = asString(f.diaper_type) ?? "wet";
            const { data: ins, error: insErr } = await supabase
              .from("diaper_logs")
              .insert({
                child_id: targetChildId,
                parent_id: userId,
                logged_at: occurred,
                diaper_type: diaperType,
                notes: entry.summary,
                source: "voice",
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            savedRows.push({ table: "diaper_logs", id: ins.id });
          } else if (entry.type === "milestone") {
            const name = asString(f.name) ?? entry.summary;
            const achievedAt = asString(f.achieved_at) ?? occurred.slice(0, 10);
            const { data: ins, error: insErr } = await supabase
              .from("custom_milestones")
              .insert({
                child_id: targetChildId,
                parent_id: userId,
                name,
                achieved_at: achievedAt,
                notes: asString(f.notes) ?? null,
                source: "voice",
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            savedRows.push({ table: "custom_milestones", id: ins.id });
          } else if (entry.type === "temperature") {
            const tempValue = asNumber(f.temp_value);
            if (tempValue === null) throw new Error("Couldn't read a temperature value.");
            const { data: ins, error: insErr } = await supabase
              .from("temperature_logs")
              .insert({
                child_id: targetChildId,
                parent_id: userId,
                temp_value: tempValue,
                unit: asString(f.unit) ?? "F",
                method: asString(f.method),
                taken_at: occurred,
                notes: entry.summary,
                source: "voice",
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            savedRows.push({ table: "temperature_logs", id: ins.id });
          }
        }

        setState("done");
        onSaved?.(entries, { fastPath: opts.fastPath === true, savedRows });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        setState("error");
      }
    },
    [onSaved]
  );

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

        const result = data as ParseResult;
        setParsed(result);

        const single = result.entries.length === 1 ? result.entries[0] : null;
        const unambiguous = !result.ambiguous || result.ambiguous.length === 0;
        if (
          childId &&
          single &&
          SAVEABLE_TYPES.includes(single.type) &&
          single.confidence >= FAST_PATH_CONFIDENCE &&
          unambiguous
        ) {
          await save(result.entries, childId, { fastPath: true });
          return;
        }

        setState("review");
      } catch (e) {
        if (e instanceof FunctionsHttpError) {
          const status = e.context?.status;
          if (status === 401) {
            setError("Your session ended, so we couldn't process that. Sign in again and give it another try.");
          } else if (status === 429) {
            setError("You've hit today's voice-log limit. You can still log by tapping, and voice comes back tomorrow.");
          } else {
            setError("We couldn't process that recording. Give it another try in a moment.");
          }
        } else {
          setError(e instanceof Error ? e.message : "Something went wrong");
        }
        setState("error");
      }
    },
    [childContext, childId, save]
  );

  const speech = useSpeechRecognition({
    onResult: (final) => {
      setTranscript(final);
      void parseTranscript(final);
    },
    onInterim: (text) => setInterim(text),
  });

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
