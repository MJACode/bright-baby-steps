import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAllergens, useAllergenIntroductions } from "@/hooks/useAllergenData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import {
  assertCanWrite, useCurrentRoleQuery, ROLE_UNRESOLVED_MESSAGE, VIEW_ONLY_MESSAGE,
} from "@/hooks/useCurrentRole";
import { isRlsViewerDenied } from "@/lib/handleRlsError";
import { parseChildDate } from "@/lib/childAge";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  ShieldAlert, AlertTriangle, Check, Clock, Play, ArrowLeft,
  ChevronRight, ChevronDown, Info, AlertCircle, Timer, Stethoscope, Trash2, Undo2, Eye, UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  allergenEmoji, getAllergenStatus, getStatusConfig,
  getDaysSinceLastExposure, canLogNextExposure, getNextExposureDate,
  introStateAfterExposureRemoval,
  severityConfig, type Severity, type AllergenStatus,
  exposureWatchEnd, isExposureInWatchWindow, exposureAwaitingReaction,
  SYMPTOM_CHIPS, classifyReaction, resolveReactionSeverity, isReaction, type ReactionLevel,
  beforeYouStartFor, CALL_911, CALL_911_EPINEPHRINE, CALL_911_POSITIONING,
  CALL_PEDIATRICIAN, CALL_PEDIATRICIAN_KEEP_WATCHING, SAVE_COPY, USUALLY_NOT_A_REACTION,
  LATER_SAME_DAY, NEXT_FEW_DAYS, GUIDANCE_FOOTER,
  FIRST_EXPOSURE_HELPER, WAIT_STEP_HELPER, startIntroToast,
  EMERGENCY_BANNER_TITLE, PEDIATRICIAN_BANNER_TITLE, ACTION_PLAN, REACTION_NOTED_DESCRIPTION,
  exposureLoggedToast, EXPOSURE_LOGGED_TOAST, REACTION_SAVED_TOAST, type GuidanceSection,
  isAwaitingSignOff, getMaintenanceState, maintenanceGuidance, maintenanceRemindersActive,
  sortDueIntroducedFirst,
} from "@/services/allergenService";

const REACTION_INPUT_HINT = "Pick how strong it is or what you see to save.";

type GuidanceTone = "destructive" | "warning" | "muted";

const GUIDANCE_TONE: Record<GuidanceTone, { box: string; title: string; followUp: string }> = {
  destructive: { box: "bg-destructive/10 border-destructive/30", title: "text-destructive", followUp: "font-bold text-destructive" },
  warning: { box: "bg-warning/10 border-warning/30", title: "text-warning", followUp: "font-semibold text-foreground" },
  muted: { box: "bg-muted/60 border-border", title: "text-muted-foreground", followUp: "text-muted-foreground" },
};

function GuidanceBlock({ section, tone }: { section: GuidanceSection; tone: GuidanceTone }) {
  const t = GUIDANCE_TONE[tone];
  return (
    <div className={cn("rounded-lg border p-3 space-y-2 text-left", t.box)}>
      <p className={cn("text-sm font-bold", t.title)}>{section.title}</p>
      <ul className="list-disc pl-4 space-y-1 text-sm text-foreground">
        {section.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {section.followUp?.map((line) => (
        <p key={line} className={cn("text-sm", t.followUp)}>{line}</p>
      ))}
    </div>
  );
}

function WatchForSection({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="touch-target w-full justify-between px-2 -mx-2 text-sm font-semibold"
        >
          <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> What to watch for</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-1">
        {children}
        <p className="text-xs text-muted-foreground">{GUIDANCE_FOOTER}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

type WatchedExposure = { logged_at: string; observation_window_ends_at?: string | null };

function ExposureWatch({ exposure, sectionKey, action }: {
  exposure: WatchedExposure | undefined;
  sectionKey: string;
  action?: ReactNode;
}) {
  const inWindow = !!exposure && isExposureInWatchWindow(exposure);
  return (
    <>
      {exposure && inWindow && (
        <p className="text-sm font-semibold text-foreground mt-1.5 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-warning" /> Watching until {format(exposureWatchEnd(exposure), "h:mm a")}
        </p>
      )}
      {action}
      <WatchForSection key={`${sectionKey}-${inWindow}`} defaultOpen={inWindow}>
        <GuidanceBlock section={CALL_911} tone="destructive" />
        <GuidanceBlock section={CALL_PEDIATRICIAN} tone="warning" />
        <GuidanceBlock section={USUALLY_NOT_A_REACTION} tone="muted" />
        <GuidanceBlock section={LATER_SAME_DAY} tone="warning" />
      </WatchForSection>
    </>
  );
}

function ReactionBanner({ level }: { level: ReactionLevel }) {
  if (level === "emergency") {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/15 p-4 flex items-start gap-2 text-left">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
        <div className="space-y-1.5">
          <p className="text-base font-bold text-destructive">{EMERGENCY_BANNER_TITLE}</p>
          <p className="text-sm font-semibold text-foreground">{CALL_911_EPINEPHRINE}</p>
          <p className="text-sm text-foreground">{CALL_911_POSITIONING}</p>
          <p className="text-sm font-semibold text-foreground">{ACTION_PLAN}</p>
        </div>
      </div>
    );
  }
  if (level === "pediatrician") {
    return (
      <div role="status" className="rounded-lg border border-warning/40 bg-warning/15 p-4 flex items-start gap-2 text-left">
        <Stethoscope className="w-5 h-5 shrink-0 mt-0.5 text-warning" />
        <div className="space-y-1.5">
          <p className="text-base font-bold text-warning">{PEDIATRICIAN_BANNER_TITLE}</p>
          <p className="text-sm text-foreground">{CALL_PEDIATRICIAN_KEEP_WATCHING}</p>
          <p className="text-sm font-semibold text-foreground">{ACTION_PLAN}</p>
        </div>
      </div>
    );
  }
  if (level === "note") {
    return <p role="status" className="text-sm text-muted-foreground text-left">{ACTION_PLAN}</p>;
  }
  return null;
}

type ReactionTarget =
  | { mode: "new_exposure"; introId: string; allergenId: string; exposureNum: number }
  | {
      mode: "existing_exposure";
      introId: string;
      exposureId: string;
      exposureNum: number;
      previousReactionObserved: boolean | null;
    };

type SaveExposureInput = {
  target: ReactionTarget;
  /** When a new exposure happened; ignored for a reaction on an existing one. */
  at?: Date;
  /** Earliest allowed time for `at` (the latest exposure already logged). */
  notBefore?: Date;
  severity: Severity;
  symptoms: string[];
  notes: string;
};

// Carries copy we wrote for the parent, so onError can show it verbatim
// without ever passing raw PostgREST text through.
class AllergenWriteError extends Error {}

function describeAllergenWriteError(err: unknown, title: string): { title: string; description: string } {
  if (err instanceof Error && (err.message === VIEW_ONLY_MESSAGE || err.message === ROLE_UNRESOLVED_MESSAGE)) {
    return { title, description: err.message };
  }
  if (isRlsViewerDenied(err)) return { title, description: VIEW_ONLY_MESSAGE };
  if (err instanceof AllergenWriteError) return { title, description: err.message };
  return { title, description: "Nothing was saved. Check your connection and try again." };
}

const clampToNow = (d: Date) => {
  const now = new Date();
  return d.getTime() > now.getTime() ? now : d;
};

const clampPick = (d: Date, min?: Date) => {
  const clamped = clampToNow(d);
  return min && clamped.getTime() < min.getTime() ? min : clamped;
};

// The exposure row outlived a failed reaction insert. Carrying its id lets a
// retry attach the reaction to it instead of inserting a duplicate exposure.
class ReactionHalfSavedError extends AllergenWriteError {
  constructor(readonly orphanExposureId: string) {
    super(SAVE_COPY.reactionHalfSaved);
  }
}

class StartExposureError extends Error {
  constructor(readonly cause: unknown, readonly rolledBack: boolean) {
    super("allergen exposure log insert failed");
  }
}

function describeStartExposureError(err: unknown, allergenName?: string): { title: string; description: string } {
  if ((err as { code?: string })?.code === "23505") {
    return {
      title: "Already started",
      description: `${allergenName ?? "This allergen"} was already started on another device. We've refreshed it.`,
    };
  }
  const title = "Couldn't log that exposure";
  if (err instanceof Error && (err.message === VIEW_ONLY_MESSAGE || err.message === ROLE_UNRESOLVED_MESSAGE)) {
    return { title, description: err.message };
  }
  if (isRlsViewerDenied(err) || (err instanceof StartExposureError && isRlsViewerDenied(err.cause))) {
    return { title, description: VIEW_ONLY_MESSAGE };
  }
  if (err instanceof StartExposureError && !err.rolledBack) {
    return { title, description: SAVE_COPY.startHalfSaved };
  }
  return { title, description: SAVE_COPY.startNotSaved };
}

export default function AllergenTracker() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const { role, isResolved: roleResolved } = useCurrentRoleQuery(activeChild?.id);
  const canWrite = roleResolved && role !== "viewer";

  // Detail view state
  const [selectedAllergenId, setSelectedAllergenId] = useState<string | null>(null);

  // Reaction dialog state
  const [reactionDialog, setReactionDialog] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<ReactionTarget | null>(null);
  const [severity, setSeverity] = useState<Severity>("none");
  // True while severity is Mild only because a chip bumped it up from None.
  const [severityAutoBumped, setSeverityAutoBumped] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [reactionNotes, setReactionNotes] = useState("");

  // isPending only lands on the next render, so a double tap could insert two
  // rows before the button disables.
  const startInFlight = useRef(false);
  const saveInFlight = useRef(false);

  // Removal confirmations
  const [undoExposureOpen, setUndoExposureOpen] = useState(false);
  const [removeEntryOpen, setRemoveEntryOpen] = useState(false);

  // One time-picker dialog serves both the first exposure and a maintenance serving.
  const [timeDialog, setTimeDialog] = useState<"start" | "serving" | null>(null);
  const [pickedAt, setPickedAt] = useState<Date>(() => new Date());
  const [exposureAt, setExposureAt] = useState<Date>(() => new Date());

  // Queries
  const { data: allergens, isLoading: allergensLoading } = useAllergens();
  const { data: introductions, isLoading: introsLoading } = useAllergenIntroductions(activeChild?.id);

  const { data: reactions } = useQuery({
    queryKey: ["allergen-reactions", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergen_reactions")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("observed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  // Mutations
  const startIntro = useMutation({
    mutationFn: async ({ allergenId, at }: { allergenId: string; at: Date }) => {
      assertCanWrite(roleResolved, role);

      const loggedAt = clampToNow(at).toISOString();

      const { data, error } = await supabase.from("allergen_introductions").insert({
        allergen_id: allergenId,
        child_id: activeChild!.id,
        parent_id: user!.id,
        status: "in_progress",
        first_introduced_at: loggedAt,
      }).select().single();
      if (error) throw error;

      // Written explicitly so a back-dated exposure's watch window starts at
      // logged_at, never at insert time.
      const exposure = {
        logged_at: loggedAt,
        observation_window_ends_at: exposureWatchEnd({ logged_at: loggedAt }).toISOString(),
      };
      const { error: logError } = await supabase.from("allergen_exposure_logs").insert({
        allergen_id: allergenId,
        allergen_introduction_id: data.id,
        child_id: activeChild!.id,
        parent_id: user!.id,
        exposure_number: 1,
        ...exposure,
      });
      if (logError) {
        // An introduction with no exposure renders as In Progress with no way
        // to log exposure #1, so undo it rather than leave it half-saved.
        const { data: deleted, error: rollbackError } = await supabase
          .from("allergen_introductions").delete().eq("id", data.id).select("id");
        throw new StartExposureError(logError, !rollbackError && !!deleted?.length);
      }
      return { allergenId: data.allergen_id as string, exposure };
    },
    onSuccess: ({ allergenId, exposure }) => {
      setTimeDialog(null);
      setSelectedAllergenId(allergenId);
      toast(startIntroToast(exposure));
    },
    onError: (err, { allergenId }) => {
      // Close when retrying can't help: a half-saved intro, or a partner already started it.
      const duplicate = (err as { code?: string })?.code === "23505";
      if (duplicate || (err instanceof StartExposureError && !err.rolledBack)) setTimeDialog(null);
      const allergenName = allergens?.find((a) => a.id === allergenId)?.name;
      toast({ ...describeStartExposureError(err, allergenName), variant: "destructive" });
    },
    onSettled: () => {
      startInFlight.current = false;
      return queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
    },
  });

  const openStartDialog = () => {
    setPickedAt(new Date());
    setTimeDialog("start");
  };

  const openServingDialog = () => {
    setPickedAt(new Date());
    setTimeDialog("serving");
  };

  const childDob = activeChild ? parseChildDate(activeChild.date_of_birth) : undefined;
  // An expected child's date is in the future; a min after the max would lock the calendar.
  const startMinDate = childDob && childDob.getTime() <= Date.now() ? childDob : undefined;

  // Reactions are SEPARATE rows from exposure logs (clean audit trail for the
  // pediatrician export). Every reaction also moves the introduction to
  // "reaction_observed" — that stored status is what the export reads.
  const saveExposure = useMutation({
    mutationFn: async ({ target, at, notBefore, severity: rawSeverity, symptoms, notes }: SaveExposureInput) => {
      assertCanWrite(roleResolved, role);
      const reacted = isReaction(rawSeverity, symptoms);
      const severity = resolveReactionSeverity(rawSeverity, symptoms);
      let newExposure: { exposure_number: number; logged_at: string; observation_window_ends_at: string } | null = null;

      let exposureId: string;
      if (target.mode === "existing_exposure") {
        const { data, error } = await supabase
          .from("allergen_exposure_logs")
          .update({ reaction_observed: true })
          .eq("id", target.exposureId)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new AllergenWriteError(SAVE_COPY.exposureGone);
        exposureId = target.exposureId;
      } else {
        // Written explicitly so a back-dated exposure's watch window starts at
        // logged_at, never at insert time.
        const loggedAt = clampPick(at ?? new Date(), notBefore).toISOString();
        newExposure = {
          exposure_number: target.exposureNum,
          logged_at: loggedAt,
          observation_window_ends_at: exposureWatchEnd({ logged_at: loggedAt }).toISOString(),
        };
        const { data, error } = await supabase.from("allergen_exposure_logs").insert({
          allergen_id: target.allergenId,
          allergen_introduction_id: target.introId,
          child_id: activeChild!.id,
          parent_id: user!.id,
          ...newExposure,
          reaction_observed: reacted,
        }).select("id").single();
        if (error) throw error;
        exposureId = data.id;
      }

      if (reacted) {
        const { error: rxError } = await supabase.from("allergen_reactions").insert({
          exposure_log_id: exposureId,
          child_id: activeChild!.id,
          parent_id: user!.id,
          severity,
          symptoms,
          parent_description: notes, // verbatim — never summarize
          ...(newExposure ? { observed_at: newExposure.logged_at } : {}),
        });
        if (rxError) {
          // An RLS-blocked rollback returns zero rows and no error, so a missing
          // row counts as a failed rollback too.
          const { data: rolledBack, error: rollbackError } = target.mode === "existing_exposure"
            ? await supabase.from("allergen_exposure_logs")
                .update({ reaction_observed: target.previousReactionObserved }).eq("id", exposureId).select("id")
            : await supabase.from("allergen_exposure_logs").delete().eq("id", exposureId).select("id");
          if (rollbackError || !rolledBack?.length) throw new ReactionHalfSavedError(exposureId);
          throw new AllergenWriteError(SAVE_COPY.reactionNotSaved);
        }
      }

      // Only a reaction moves the stored status. A clean exposure never
      // completes the intro: that takes the parent's explicit sign-off.
      // The exposure is already saved, so a failed status write is a warning,
      // not an error — throwing would invite a retry that duplicates the log.
      let warning: string | null = null;
      if (reacted) {
        const { data, error } = await supabase
          .from("allergen_introductions")
          .update({ status: "reaction_observed", completed_at: null })
          .eq("id", target.introId)
          .select("id");
        if (error || !data?.length) warning = SAVE_COPY.reactionStatusStale;
      }
      return { level: classifyReaction(symptoms, severity), reacted, warning, newExposure };
    },
    onSuccess: ({ level, reacted, warning, newExposure }) => {
      closeReactionDialog();
      setTimeDialog(null);
      // The triage line is safety copy: a stale-status warning rides along
      // after it and never replaces it (TOAST_LIMIT is 1, so one toast).
      const base = reacted && level !== "none"
        ? REACTION_SAVED_TOAST[level]
        : newExposure ? exposureLoggedToast(newExposure) : EXPOSURE_LOGGED_TOAST;
      toast(warning ? { title: base.title, description: `${base.description} ${warning}`.trim() } : base);
    },
    onError: (err, { target }) => {
      if (err instanceof ReactionHalfSavedError && target.mode === "new_exposure") {
        // The orphan is stored with reaction_observed = true, so that is the
        // value a failed retry should leave behind.
        setReactionTarget({
          mode: "existing_exposure",
          introId: target.introId,
          exposureId: err.orphanExposureId,
          exposureNum: target.exposureNum,
          previousReactionObserved: true,
        });
      }
      toast({ ...describeAllergenWriteError(err, "Couldn't save that"), variant: "destructive" });
    },
    onSettled: () => {
      saveInFlight.current = false;
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
    },
  });

  const markIntroduced = useMutation({
    mutationFn: async ({ introId }: { introId: string; allergenName: string; slug: string }) => {
      assertCanWrite(roleResolved, role);
      // Scoped to in_progress so a reaction logged on another device isn't overwritten.
      const { data, error } = await supabase.from("allergen_introductions").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", introId).eq("status", "in_progress").select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new AllergenWriteError("This allergen changed on another device. We've refreshed it, so check it and try again.");
      }
    },
    onSuccess: (_data, { allergenName, slug }) => {
      toast({ title: `${allergenName} is on the menu`, description: `${maintenanceGuidance(slug)} keeps it there.` });
    },
    onError: (err) => {
      toast({ ...describeAllergenWriteError(err, "Couldn't confirm that"), variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] }),
  });

  // Reactions hang off exposure logs, exposure logs off the introduction, so
  // removal always walks child → parent. Explicit deletes rather than relying on
  // FK cascades, which aren't guaranteed on these tables.
  const removeExposure = useMutation({
    mutationFn: async ({
      introId, exposureId, remaining, current,
    }: {
      introId: string;
      exposureId: string;
      remaining: { logged_at: string; reaction_observed: boolean | null }[];
      current: { status: string; completed_at: string | null };
    }) => {
      assertCanWrite(roleResolved, role);

      const { error: rxError } = await supabase.from("allergen_reactions").delete().eq("exposure_log_id", exposureId);
      if (rxError) throw rxError;
      // An RLS-blocked DELETE returns zero rows and no error — check the
      // returned rows so a blocked delete can't toast success.
      const { data: deletedLogs, error: logError } = await supabase
        .from("allergen_exposure_logs").delete().eq("id", exposureId).select("id");
      if (logError) throw logError;
      if (!deletedLogs?.length) throw new AllergenWriteError("That exposure is no longer yours to remove.");

      const next = introStateAfterExposureRemoval(remaining, current);
      const { error: introError } = await supabase.from("allergen_introductions").update({
        status: next.status,
        completed_at: next.completed_at,
      }).eq("id", introId);
      if (introError) {
        throw new AllergenWriteError("The exposure was removed, but this allergen's status didn't update. Refresh the page to see it.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      setUndoExposureOpen(false);
      toast({ title: "Exposure removed", description: "The rest of this protocol is unchanged." });
    },
    onError: (err) => {
      toast({ ...describeAllergenWriteError(err, "Couldn't remove that exposure"), variant: "destructive" });
    },
  });

  const removeIntroduction = useMutation({
    mutationFn: async (introId: string) => {
      assertCanWrite(roleResolved, role);

      const { data: logs, error: fetchError } = await supabase
        .from("allergen_exposure_logs")
        .select("id")
        .eq("allergen_introduction_id", introId);
      if (fetchError) throw fetchError;

      const logIds = (logs ?? []).map((l) => l.id);
      if (logIds.length > 0) {
        const { error: rxError } = await supabase.from("allergen_reactions").delete().in("exposure_log_id", logIds);
        if (rxError) throw rxError;
        const { error: logError } = await supabase.from("allergen_exposure_logs").delete().in("id", logIds);
        if (logError) throw logError;
      }

      const { data: deletedIntro, error } = await supabase
        .from("allergen_introductions").delete().eq("id", introId).select("id");
      if (error) throw error;
      if (!deletedIntro?.length) throw new AllergenWriteError("This entry is no longer yours to remove.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      setRemoveEntryOpen(false);
      setSelectedAllergenId(null);
      toast({ title: "Tracking removed", description: "You can start this allergen again whenever you're ready." });
    },
    onError: (err) => {
      toast({ ...describeAllergenWriteError(err, "Couldn't remove this entry"), variant: "destructive" });
    },
  });

  const resetReactionForm = () => {
    setSeverity("none");
    setSeverityAutoBumped(false);
    setSymptoms([]);
    setReactionNotes("");
    setReactionTarget(null);
  };

  const closeReactionDialog = () => {
    setReactionDialog(false);
    resetReactionForm();
  };

  const openReactionDialog = (target: ReactionTarget, initialSeverity: Severity = "none", at: Date = new Date()) => {
    resetReactionForm();
    setReactionTarget(target);
    setSeverity(initialSeverity);
    setExposureAt(at);
    setReactionDialog(true);
  };

  const submitStart = (allergenId: string) => {
    if (startInFlight.current) return;
    startInFlight.current = true;
    startIntro.mutate({ allergenId, at: pickedAt });
  };

  const submitSave = (input: SaveExposureInput) => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    saveExposure.mutate(input);
  };

  const getIntro = (allergenId: string) => introductions?.find((i) => i.allergen_id === allergenId);

  const now = new Date();
  const remindersActive = activeChild ? maintenanceRemindersActive(activeChild, now) : false;

  // Computed values
  const totalAllergens = allergens?.length ?? 0;
  const introducedCount = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === "introduced").length ?? 0;
  const reactionCount = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === "reaction_noted").length ?? 0;
  const inProgressCount = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === "in_progress").length ?? 0;
  const progressPct = totalAllergens > 0 ? Math.round((introducedCount / totalAllergens) * 100) : 0;

  const selectedAllergen = allergens?.find((a) => a.id === selectedAllergenId);
  const selectedIntro = selectedAllergenId ? getIntro(selectedAllergenId) : undefined;

  const hasReaction = isReaction(severity, symptoms);
  const reactionLevel = classifyReaction(symptoms, severity);
  const needsReactionInput = reactionTarget?.mode === "existing_exposure" && !hasReaction;

  // Re-render when a watch window closes so the "What to watch for" panel and
  // the "Watching until" line don't outlive it.
  const renderNow = Date.now();
  const upcomingWatchEnds = (selectedIntro?.allergen_exposure_logs ?? [])
    .map((e) => exposureWatchEnd(e).getTime())
    .filter((ms) => ms > renderNow);
  const nextWatchEndMs = upcomingWatchEnds.length > 0 ? Math.min(...upcomingWatchEnds) : null;
  const [, setWatchTick] = useState(0);
  useEffect(() => {
    if (nextWatchEndMs === null) return;
    const timer = window.setTimeout(
      () => setWatchTick((n) => n + 1),
      Math.max(0, nextWatchEndMs - Date.now()) + 500,
    );
    return () => window.clearTimeout(timer);
  }, [nextWatchEndMs]);

  // No child state
  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-destructive" /> Allergen Introduction
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking allergens.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  // Loading state
  if (allergensLoading || introsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="grid gap-3 grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ─── DETAIL / PROTOCOL SCREEN ───
  if (selectedAllergen) {
    const intro = selectedIntro;
    const status = getAllergenStatus(intro);
    const exposures = intro?.allergen_exposure_logs ?? [];
    const awaitingSignOff = isAwaitingSignOff(intro);
    const statusCfg = getStatusConfig(status, { awaitingSignOff });
    const sortedExposures = [...exposures].sort((a, b) => a.exposure_number - b.exposure_number);
    const lastExposure = sortedExposures[sortedExposures.length - 1];
    const canLogNext = canLogNextExposure(exposures);
    const nextDate = getNextExposureDate(exposures);
    const daysSince = getDaysSinceLastExposure(exposures);
    const allergenReactions = reactions?.filter((r) =>
      exposures.some((e) => e.id === r.exposure_log_id)
    ) ?? [];
    const isHighRisk = intro?.is_high_risk ?? false;
    const emoji = allergenEmoji[selectedAllergen.slug] ?? "🍽️";
    const beforeYouStart = beforeYouStartFor(selectedAllergen.slug);
    const firstExposure = sortedExposures[0];
    const secondExposure = sortedExposures[1];
    const awaitingReaction = canWrite
      ? exposureAwaitingReaction(intro, allergenReactions.map((r) => r.exposure_log_id))
      : null;
    const signOffNeedsPediatrician = isHighRisk || (reactions?.length ?? 0) > 0;
    const maintenance = getMaintenanceState(intro, selectedAllergen.slug, now);
    const nextExposureNum = Math.max(0, ...exposures.map((e) => e.exposure_number)) + 1;
    // A new exposure or serving can't be back-dated before the latest one
    // already logged (so a serving can't predate exposure #2 or the sign-off).
    const latestExposureAt = exposures.length
      ? new Date(Math.max(...exposures.map((e) => new Date(e.logged_at).getTime())))
      : startMinDate;
    const newExposureTarget = (exposureNum: number): ReactionTarget | null => intro
      ? { mode: "new_exposure", introId: intro.id, allergenId: selectedAllergen.id, exposureNum }
      : null;
    const openLatestReaction = () => {
      if (!awaitingReaction || !intro) return;
      openReactionDialog({
        mode: "existing_exposure",
        introId: intro.id,
        exposureId: awaitingReaction.id,
        exposureNum: awaitingReaction.exposure_number,
        previousReactionObserved: awaitingReaction.reaction_observed,
      });
    };
    const logReactionButton = awaitingReaction && intro && (
      <Button
        variant="outline"
        className="touch-target h-12 w-full mt-2 gap-2 font-semibold border-destructive/30 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={openLatestReaction}
      >
        <AlertTriangle className="w-4 h-4" />
        {awaitingReaction.exposure_number > 1
          ? `Log a reaction to exposure #${awaitingReaction.exposure_number}`
          : "Log a reaction"}
      </Button>
    );

    return (
      <div className="space-y-5">
        {/* Back button */}
        <Button variant="ghost" size="sm" className="touch-target gap-1 -ml-2" onClick={() => setSelectedAllergenId(null)}>
          <ArrowLeft className="w-4 h-4" /> All Allergens
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">{emoji}</span> {selectedAllergen.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Introduce: {selectedAllergen.introduction_age_weeks_min}–{selectedAllergen.introduction_age_weeks_max ?? "?"} weeks
            </p>
          </div>
          <Badge className={cn("text-xs", statusCfg.className)}>{statusCfg.label}</Badge>
        </div>

        {/* High-risk banner */}
        {isHighRisk && (
          <Card className="border-warning/30 bg-warning/10">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-warning">Higher Risk</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Because {activeChild.name} may be at higher risk, we recommend introducing this allergen with your pediatrician's guidance.
                </p>
                {intro?.high_risk_reason && (
                  <p className="text-xs text-muted-foreground mt-1 italic">Reason: {intro.high_risk_reason}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Clinical guidance */}
        <Card className="border-0 bg-secondary">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">{selectedAllergen.clinical_guidance}</p>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  Source: {selectedAllergen.clinical_source}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Common forms */}
        {selectedAllergen.common_forms && selectedAllergen.common_forms.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Common Forms</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedAllergen.common_forms.map((form) => (
                <Badge key={form} variant="outline" className="text-xs">{form}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* ─── PROTOCOL STEPS ─── */}
        <div className="space-y-3">
          <h3 className="font-display font-bold text-sm">Introduction Protocol</h3>

          {/* Step 1: First Exposure */}
          <Card className={cn("border-0 transition-all", sortedExposures.length >= 1 ? "bg-success/10" : "bg-secondary")}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                  sortedExposures.length >= 1 ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {sortedExposures.length >= 1 ? <Check className="w-4 h-4" /> : "1"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">First Exposure</p>
                  <p className="text-xs text-muted-foreground">{FIRST_EXPOSURE_HELPER}</p>
                  {firstExposure && (
                    <p className="text-xs text-success mt-1.5 font-semibold">
                      ✓ Logged {format(new Date(firstExposure.logged_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                  <ExposureWatch
                    exposure={firstExposure}
                    sectionKey={`${selectedAllergen.id}-1`}
                    action={awaitingReaction && awaitingReaction.id === firstExposure?.id ? logReactionButton : null}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: 3-Day Wait */}
          <Card className={cn("border-0 transition-all",
            sortedExposures.length === 1 ? "bg-warning/10 ring-1 ring-warning/30" :
            sortedExposures.length >= 2 ? "bg-success/10" : "bg-secondary"
          )}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                  sortedExposures.length >= 2 ? "bg-success text-success-foreground" :
                  sortedExposures.length === 1 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {sortedExposures.length >= 2 ? <Check className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Wait 3 Days</p>
                  <p className="text-xs text-muted-foreground">{WAIT_STEP_HELPER}</p>
                  {sortedExposures.length === 1 && nextDate && (
                    <div className="mt-2">
                      {canLogNext ? (
                        <Badge className="bg-success/15 text-success text-xs">✅ 3-day wait complete — ready for next exposure</Badge>
                      ) : (
                        <div className="space-y-1.5">
                          <Badge className="bg-warning/15 text-warning text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            Wait until {format(nextDate, "MMM d")} ({3 - (daysSince ?? 0)} days remaining)
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                  <WatchForSection key={selectedAllergen.id} defaultOpen={false}>
                    <GuidanceBlock section={NEXT_FEW_DAYS} tone="warning" />
                    <GuidanceBlock section={LATER_SAME_DAY} tone="warning" />
                  </WatchForSection>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Second Exposure */}
          <Card className={cn("border-0 transition-all", sortedExposures.length >= 2 ? "bg-success/10" : "bg-secondary")}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                  sortedExposures.length >= 2 ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {sortedExposures.length >= 2 ? <Check className="w-4 h-4" /> : "2"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Second Exposure</p>
                  <p className="text-xs text-muted-foreground">Offer again and log any reaction.</p>
                  {secondExposure && (
                    <>
                      <p className="text-xs text-success mt-1.5 font-semibold">
                        ✓ Logged {format(new Date(secondExposure.logged_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      <ExposureWatch
                        exposure={secondExposure}
                        sectionKey={`${selectedAllergen.id}-2`}
                        action={awaitingReaction && awaitingReaction.id === secondExposure.id ? logReactionButton : null}
                      />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 4: Result */}
          <Card className={cn("border-0 transition-all",
            status === "introduced" ? "bg-success/10" :
            status === "reaction_noted" ? "bg-destructive/10" : "bg-secondary"
          )}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                  status === "introduced" ? "bg-success text-success-foreground" :
                  status === "reaction_noted" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {status === "introduced" ? <Check className="w-4 h-4" /> :
                   status === "reaction_noted" ? <AlertTriangle className="w-4 h-4" /> : "✓"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">
                    {status === "introduced" ? "Successfully Introduced!" :
                     status === "reaction_noted" ? "Review with Pediatrician" :
                     awaitingSignOff ? "Ready to confirm" :
                     "Confirm after two exposures with no reaction"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {status === "introduced" ? `${selectedAllergen.name} is now part of ${activeChild.name}'s diet.` :
                     status === "reaction_noted" ? REACTION_NOTED_DESCRIPTION :
                     awaitingSignOff ? "Two reaction-free tastes are logged." :
                     "Log the second exposure after the wait."}
                  </p>
                  {status === "introduced" && logReactionButton}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action buttons */}
        {status === "not_started" && canWrite && (
          <Button
            className="w-full touch-target h-14 text-base font-bold gap-2 bg-feeding hover:bg-feeding/90"
            onClick={openStartDialog}
            disabled={startIntro.isPending}
          >
            <Play className="w-5 h-5" /> Start First Exposure
          </Button>
        )}

        {status === "in_progress" && sortedExposures.length === 1 && canLogNext && canWrite && intro && (
          <Button
            className="w-full touch-target h-14 text-base font-bold gap-2 bg-warning hover:bg-warning/90 text-warning-foreground"
            onClick={() => {
              const target = newExposureTarget(nextExposureNum);
              if (target) openReactionDialog(target);
            }}
          >
            <Clock className="w-5 h-5" /> Log Exposure #{nextExposureNum}
          </Button>
        )}

        {awaitingSignOff && canWrite && intro && (
          <Card className="border-0 bg-primary/10">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-display font-bold text-base">
                Did {activeChild.name} eat a typical portion with no reaction?
              </h3>
              <p className="text-sm text-muted-foreground">
                Two reaction-free tastes is a great sign. Confirming moves {selectedAllergen.name} to keeping it on the menu.
              </p>
              {signOffNeedsPediatrician && (
                <p className="text-sm text-foreground">
                  Because {activeChild.name} has a higher allergy risk, check with your pediatrician before you confirm.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  className="touch-target h-12 gap-1 font-bold"
                  disabled={markIntroduced.isPending}
                  onClick={() => markIntroduced.mutate({
                    introId: intro.id, allergenName: selectedAllergen.name, slug: selectedAllergen.slug,
                  })}
                >
                  <Check className="w-4 h-4" /> Yes, it's on the menu
                </Button>
                <Button
                  variant="outline"
                  className="touch-target h-12 gap-1 border-destructive/30 text-destructive font-bold"
                  disabled={markIntroduced.isPending || !awaitingReaction}
                  onClick={openLatestReaction}
                >
                  <Stethoscope className="w-4 h-4" /> Flag for Review
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {maintenance && (
          <Card className="border-0 bg-feeding-bg">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-base flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-feeding" /> Keep it on the menu
                </h3>
                {remindersActive && maintenance.due && (
                  <Badge className="text-xs bg-accent/15 text-accent border-accent/30">Due</Badge>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">{maintenance.servings} of {maintenance.target} this week</p>
                <Progress value={Math.min(100, (maintenance.servings / maintenance.target) * 100)} className="h-2" />
                <p className="text-xs text-muted-foreground">{maintenanceGuidance(selectedAllergen.slug)}</p>
              </div>
              {canWrite && (
                <Button
                  className="w-full touch-target h-12 gap-2 font-bold bg-feeding hover:bg-feeding/90"
                  onClick={openServingDialog}
                  disabled={saveExposure.isPending}
                >
                  <Check className="w-4 h-4" /> Had it today
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {maintenance?.lapsed && remindersActive && (
          <Card className="border-0 bg-secondary">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-feeding shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold">
                  Time for another taste of {selectedAllergen.name}. Regular servings help keep it on the menu.
                </p>
                <p className="text-xs text-muted-foreground">{FIRST_EXPOSURE_HELPER}</p>
                <WatchForSection key={`${selectedAllergen.id}-lapsed`} defaultOpen={false}>
                  <GuidanceBlock section={CALL_911} tone="destructive" />
                  <GuidanceBlock section={CALL_PEDIATRICIAN} tone="warning" />
                  <GuidanceBlock section={USUALLY_NOT_A_REACTION} tone="muted" />
                  <GuidanceBlock section={LATER_SAME_DAY} tone="warning" />
                </WatchForSection>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reaction history */}
        {allergenReactions.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-display font-bold text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Reaction History
            </h3>
            {allergenReactions.map((rx) => (
              <Card key={rx.id} className="border-0 bg-destructive/5">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge className={cn("text-xs", severityConfig[rx.severity as Severity]?.color ?? "bg-muted")}>
                      {severityConfig[rx.severity as Severity]?.emoji} {rx.severity}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{format(new Date(rx.observed_at), "MMM d, h:mm a")}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rx.symptoms?.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                  {/* Verbatim parent description — never summarized */}
                  {rx.parent_description && (
                    <p className="text-xs text-muted-foreground italic mt-1">"{rx.parent_description}"</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── UNDO / REMOVE ─── */}
        {intro && canWrite && (
          <div className="space-y-2 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Logged this by mistake? You can take it back.</p>

            {sortedExposures.length >= 2 && (
              <Button
                variant="outline"
                className="w-full touch-target h-12 gap-2 font-semibold"
                onClick={() => setUndoExposureOpen(true)}
              >
                <Undo2 className="w-4 h-4" /> Undo exposure #{lastExposure?.exposure_number}
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full touch-target h-12 gap-2 font-semibold text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setRemoveEntryOpen(true)}
            >
              <Trash2 className="w-4 h-4" /> Remove {selectedAllergen.name} tracking
            </Button>
          </div>
        )}

        {/* ─── BEFORE-YOU-START / SERVING DIALOG ─── */}
        <Dialog
          open={timeDialog !== null}
          onOpenChange={(open) => { if (!open && !startIntro.isPending && !saveExposure.isPending) setTimeDialog(null); }}
        >
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            {timeDialog === "serving" ? (
              <>
                <DialogHeader className="text-left">
                  <DialogTitle className="font-display text-lg">Log a serving of {selectedAllergen.name}?</DialogTitle>
                  <DialogDescription>It counts toward this week's servings.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-left">
                  <MobileDateTimePicker
                    value={pickedAt}
                    onChange={(d) => setPickedAt(clampPick(d, latestExposureAt))}
                    maxDate={new Date()}
                    minDate={latestExposureAt}
                    label={`When did ${activeChild.name} have it?`}
                  />
                  <Button
                    type="button"
                    variant="link"
                    className="touch-target px-0 font-semibold text-destructive"
                    onClick={() => {
                      const target = newExposureTarget(nextExposureNum);
                      // Close this dialog first: two Radix focus traps fight when both are open.
                      setTimeDialog(null);
                      if (target) openReactionDialog(target, "mild", pickedAt);
                    }}
                  >
                    Noticed a reaction?
                  </Button>
                  <div className="space-y-2">
                    <Button
                      className="w-full touch-target h-12 text-base font-bold gap-2 bg-feeding hover:bg-feeding/90"
                      disabled={saveExposure.isPending}
                      onClick={() => {
                        const target = newExposureTarget(nextExposureNum);
                        if (target) submitSave({
                          target, at: pickedAt, notBefore: latestExposureAt, severity: "none", symptoms: [], notes: "",
                        });
                      }}
                    >
                      {saveExposure.isPending ? "Logging..." : "Log serving"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full touch-target h-12 font-semibold"
                      onClick={() => setTimeDialog(null)}
                      disabled={saveExposure.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <DialogHeader className="text-left">
                  <DialogTitle className="font-display text-lg">Before you offer {selectedAllergen.name}</DialogTitle>
                  <DialogDescription>
                    This starts the 2-hour watch and the 3-day wait for {activeChild.name}.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-left">
                  <div className="space-y-2">
                    <p className="text-sm font-bold">{beforeYouStart.title}</p>
                    <ul className="space-y-2">
                      {beforeYouStart.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <GuidanceBlock section={CALL_911} tone="destructive" />
                  <div className="space-y-1">
                    <MobileDateTimePicker
                      value={pickedAt}
                      onChange={(d) => setPickedAt(clampPick(d, startMinDate))}
                      maxDate={new Date()}
                      minDate={startMinDate}
                      label="When did you offer it?"
                    />
                    <p className="text-xs text-muted-foreground">Already offered it? Set the time you did.</p>
                  </div>
                  <div className="space-y-2">
                    <Button
                      className="w-full touch-target h-12 text-base font-bold gap-2 bg-feeding hover:bg-feeding/90"
                      onClick={() => submitStart(selectedAllergen.id)}
                      disabled={startIntro.isPending}
                    >
                      <Play className="w-5 h-5" />
                      {startIntro.isPending ? "Starting..." : "Start — I'll watch for 2 hours"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full touch-target h-12 font-semibold"
                      onClick={() => setTimeDialog(null)}
                      disabled={startIntro.isPending}
                    >
                      Not yet
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ─── REACTION LOGGING DIALOG ─── */}
        <Dialog open={reactionDialog} onOpenChange={(open) => { if (!open) closeReactionDialog(); }}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-lg">
                {reactionTarget?.mode === "existing_exposure"
                  ? `Log a reaction to exposure #${reactionTarget.exposureNum}`
                  : `Log Exposure #${reactionTarget?.exposureNum}`}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Pick what you see. We'll tell you if it needs a call.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 text-left">
              {reactionTarget?.mode === "new_exposure" && (
                <MobileDateTimePicker
                  value={exposureAt}
                  onChange={(d) => setExposureAt(clampPick(d, latestExposureAt))}
                  maxDate={new Date()}
                  minDate={latestExposureAt}
                  label="When?"
                />
              )}

              {/* Severity — large color-coded buttons */}
              <div className="space-y-2">
                <Label className="text-sm font-bold">
                  {reactionTarget?.mode === "existing_exposure" ? "How strong is it?" : "Any Reaction?"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(severityConfig) as [Severity, typeof severityConfig.none][])
                    .filter(([key]) => !(reactionTarget?.mode === "existing_exposure" && key === "none"))
                    .map(([key, cfg]) => (
                      <Button
                        key={key}
                        variant="outline"
                        className={cn(
                          "touch-target h-14 text-sm font-bold transition-all",
                          severity === key ? cfg.activeColor : cfg.color
                        )}
                        onClick={() => {
                          setSeverity(key);
                          setSeverityAutoBumped(false);
                          // "None" means no reaction — drop chips so what's saved matches what's shown.
                          if (key === "none") setSymptoms([]);
                        }}
                      >
                        <span className="text-lg mr-1">{cfg.emoji}</span> {cfg.label}
                      </Button>
                    ))}
                </div>
              </div>

              {/* Symptoms — always visible so a chip can escalate even at "None" or "Mild" */}
              <div className="space-y-2">
                <Label className="text-sm font-bold">What do you see?</Label>
                <div className="flex flex-wrap gap-2">
                  {SYMPTOM_CHIPS.map((chip) => {
                    const selected = symptoms.includes(chip.value);
                    return (
                      <Button
                        key={chip.value}
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        aria-pressed={selected}
                        className={cn("text-sm touch-target h-auto min-h-[48px] whitespace-normal text-left",
                          selected && "bg-destructive/80 hover:bg-destructive"
                        )}
                        onClick={() => {
                          const next = selected
                            ? symptoms.filter((s) => s !== chip.value)
                            : [...symptoms, chip.value];
                          if (!selected && severity === "none") {
                            setSeverity("mild");
                            setSeverityAutoBumped(true);
                          } else if (next.length === 0 && severityAutoBumped) {
                            setSeverity("none");
                            setSeverityAutoBumped(false);
                          }
                          setSymptoms(next);
                        }}
                      >
                        {chip.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <ReactionBanner level={reactionLevel} />

              {hasReaction && (
                /* Verbatim notes — never summarize or interpret */
                <div className="space-y-1">
                  <Label className="text-sm font-bold">Describe What You Observed</Label>
                  <Textarea
                    value={reactionNotes}
                    onChange={(e) => setReactionNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe exactly what you saw — timing, severity, how your child responded..."
                    className="text-base md:text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Your description will be stored exactly as written for your pediatrician.</p>
                </div>
              )}

              {needsReactionInput && (
                <p className="text-sm text-muted-foreground">{REACTION_INPUT_HINT}</p>
              )}
              <Button
                className="w-full touch-target h-12 text-base font-bold"
                onClick={() => reactionTarget && submitSave({
                  target: reactionTarget, at: exposureAt, notBefore: latestExposureAt,
                  severity, symptoms, notes: reactionNotes,
                })}
                disabled={saveExposure.isPending || needsReactionInput}
              >
                {saveExposure.isPending
                  ? "Saving..."
                  : reactionTarget?.mode === "existing_exposure" ? "Save reaction" : "Save Exposure"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Undo the most recent exposure, keeping the rest of the protocol */}
        <AlertDialog open={undoExposureOpen} onOpenChange={setUndoExposureOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">
                Undo exposure #{lastExposure?.exposure_number}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the exposure logged{" "}
                {lastExposure && format(new Date(lastExposure.logged_at), "MMM d, yyyy 'at' h:mm a")}
                {" "}and any reaction notes saved with it. Earlier exposures stay as they are. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="touch-target">Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="touch-target bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={removeExposure.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (!intro || !lastExposure) return;
                  removeExposure.mutate({
                    introId: intro.id,
                    exposureId: lastExposure.id,
                    remaining: sortedExposures.filter((ex) => ex.id !== lastExposure.id),
                    current: { status: intro.status, completed_at: intro.completed_at },
                  });
                }}
              >
                {removeExposure.isPending ? "Removing..." : "Undo exposure"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Remove the whole introduction — back to Not Started */}
        <AlertDialog open={removeEntryOpen} onOpenChange={setRemoveEntryOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">
                Remove {selectedAllergen.name} tracking?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This deletes {sortedExposures.length === 1 ? "the 1 logged exposure" : `all ${sortedExposures.length} logged exposures`}
                {allergenReactions.length > 0 && " and the reaction notes saved with them"} for {activeChild.name}.
                {" "}{selectedAllergen.name} goes back to Not Started and you can begin the protocol again anytime. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="touch-target">Keep tracking</AlertDialogCancel>
              <AlertDialogAction
                className="touch-target bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={removeIntroduction.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (intro) removeIntroduction.mutate(intro.id);
                }}
              >
                {removeIntroduction.isPending ? "Removing..." : "Remove entry"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── OVERVIEW SCREEN (All Allergens) ───
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-destructive" /> Allergen Introduction
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name}'s Big 9 allergen protocol
        </p>
      </div>

      {/* Progress score */}
      <Card className="border-0 bg-feeding-bg">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">{introducedCount} of {totalAllergens} introduced</p>
              <p className="text-[10px] text-muted-foreground">
                {inProgressCount > 0 && `${inProgressCount} in progress`}
                {inProgressCount > 0 && reactionCount > 0 && " · "}
                {reactionCount > 0 && `${reactionCount} with reactions`}
              </p>
            </div>
            <Badge variant="secondary" className="text-sm font-bold">{progressPct}%</Badge>
          </div>
          <Progress value={progressPct} className="h-2.5" />
        </CardContent>
      </Card>

      {/* Status filter legend */}
      <div className="flex flex-wrap gap-2">
        {(["not_started", "in_progress", "introduced", "reaction_noted"] as AllergenStatus[]).map((s) => {
          const cfg = getStatusConfig(s);
          const count = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === s).length ?? 0;
          return (
            <Badge key={s} variant="outline" className={cn("text-[10px] gap-1", count === 0 && "opacity-40")}>
              <span className={cn("w-2 h-2 rounded-full", cfg.dotColor)} />
              {cfg.label} ({count})
            </Badge>
          );
        })}
      </div>

      {/* Allergen grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {sortDueIntroducedFirst(
          allergens ?? [],
          (a) => getAllergenStatus(getIntro(a.id)) === "introduced",
          (a) => remindersActive && !!getMaintenanceState(getIntro(a.id), a.slug, now)?.due,
        ).map((allergen) => {
          const intro = getIntro(allergen.id);
          const status = getAllergenStatus(intro);
          const statusCfg = getStatusConfig(status, { awaitingSignOff: isAwaitingSignOff(intro) });
          const maintenance = getMaintenanceState(intro, allergen.slug, now);
          const exposures = intro?.allergen_exposure_logs ?? [];
          const emoji = allergenEmoji[allergen.slug] ?? "🍽️";
          const isHighRisk = intro?.is_high_risk ?? false;

          return (
            <Card
              key={allergen.id}
              className={cn(
                "border-0 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]",
                status === "introduced" ? "bg-success/10" :
                status === "reaction_noted" ? "bg-destructive/10" :
                status === "in_progress" ? "bg-warning/10" : "bg-secondary"
              )}
              onClick={() => setSelectedAllergenId(allergen.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{emoji}</span>
                    <div>
                      <p className="text-sm font-bold leading-tight">{allergen.name}</p>
                      {isHighRisk && (
                        <span className="text-[10px] text-warning font-semibold flex items-center gap-0.5">
                          <AlertCircle className="w-3 h-3" /> High Risk
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>

                <div className="flex items-center justify-between">
                  <Badge className={cn("text-[10px]", statusCfg.className)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full mr-1", statusCfg.dotColor)} />
                    {statusCfg.label}
                  </Badge>
                  {intro?.first_introduced_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Started {format(new Date(intro.first_introduced_at), "MMM d")}
                    </p>
                  )}
                </div>

                {maintenance && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {maintenance.servings} of {maintenance.target} this week
                    </p>
                    {remindersActive && maintenance.due && (
                      <Badge className="text-xs bg-accent/15 text-accent border-accent/30">Due</Badge>
                    )}
                  </div>
                )}

                {/* Protocol progress dots */}
                {status !== "not_started" && !maintenance && (
                  <div className="flex gap-1.5 mt-2">
                    {[1, 2].map((step) => (
                      <div key={step} className={cn(
                        "h-1.5 flex-1 rounded-full transition-all",
                        exposures.length >= step ? (
                          exposures.some(e => e.exposure_number === step && e.reaction_observed)
                            ? "bg-destructive" : "bg-success"
                        ) : "bg-muted"
                      )} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Disclaimer */}
      <Card className="border-0 bg-secondary/50">
        <CardContent className="p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground italic">
            General guidelines, not medical advice — check with your pediatrician before introducing new allergens.
          </p>
        </CardContent>
      </Card>

    </div>
  );
}
