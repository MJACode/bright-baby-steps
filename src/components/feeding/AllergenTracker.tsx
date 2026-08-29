import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { assertCanWrite, useCurrentRoleQuery } from "@/hooks/useCurrentRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  ShieldAlert, AlertTriangle, Check, Clock, Play, ArrowLeft,
  ChevronRight, Info, AlertCircle, Timer, Stethoscope, Trash2, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  allergenEmoji, getAllergenStatus, getStatusConfig,
  getDaysSinceLastExposure, canLogNextExposure, getNextExposureDate,
  introStateAfterExposureRemoval,
  severityConfig, symptomOptions, type Severity, type AllergenStatus,
} from "@/services/allergenService";

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
  const [currentExposureIntro, setCurrentExposureIntro] = useState<{ introId: string; allergenId: string; exposureNum: number } | null>(null);
  const [severity, setSeverity] = useState<Severity>("none");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [reactionNotes, setReactionNotes] = useState("");

  // Removal confirmations
  const [undoExposureOpen, setUndoExposureOpen] = useState(false);
  const [removeEntryOpen, setRemoveEntryOpen] = useState(false);

  // Queries
  const { data: allergens, isLoading: allergensLoading } = useQuery({
    queryKey: ["allergens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allergens").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: introductions, isLoading: introsLoading } = useQuery({
    queryKey: ["allergen-introductions", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allergen_introductions")
        .select("*, allergen_exposure_logs(*)")
        .eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

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
    mutationFn: async (allergenId: string) => {
      const { data, error } = await supabase.from("allergen_introductions").insert({
        allergen_id: allergenId,
        child_id: activeChild!.id,
        parent_id: user!.id,
        status: "in_progress",
        first_introduced_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      await supabase.from("allergen_exposure_logs").insert({
        allergen_id: allergenId,
        allergen_introduction_id: data.id,
        child_id: activeChild!.id,
        parent_id: user!.id,
        exposure_number: 1,
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      toast({ title: "First exposure logged! 🥜", description: "Wait 3 days before the next exposure." });
      setSelectedAllergenId(data.allergen_id);
    },
  });

  const logExposure = useMutation({
    mutationFn: async ({ introId, allergenId, exposureNum }: { introId: string; allergenId: string; exposureNum: number }) => {
      const { data: exposureLog, error: expError } = await supabase.from("allergen_exposure_logs").insert({
        allergen_id: allergenId,
        allergen_introduction_id: introId,
        child_id: activeChild!.id,
        parent_id: user!.id,
        exposure_number: exposureNum,
        reaction_observed: severity !== "none",
      }).select().single();
      if (expError) throw expError;

      // Reactions are SEPARATE from exposure logs (clean audit trail for pediatrician export)
      // Store parent's verbatim reaction description — do NOT summarize or interpret
      if (severity !== "none" && exposureLog) {
        const { error: rxError } = await supabase.from("allergen_reactions").insert({
          exposure_log_id: exposureLog.id,
          child_id: activeChild!.id,
          parent_id: user!.id,
          severity,
          symptoms,
          parent_description: reactionNotes, // verbatim — never summarize
        });
        if (rxError) throw rxError;
      }

      // If this is exposure 2 with no reaction, mark as completed
      if (exposureNum >= 2 && severity === "none") {
        await supabase.from("allergen_introductions").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", introId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      setReactionDialog(false);
      resetReactionForm();
      toast({ title: "Exposure logged! ✅" });
    },
  });

  const markIntroduced = useMutation({
    mutationFn: async (introId: string) => {
      const { error } = await supabase.from("allergen_introductions").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", introId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      toast({ title: "Allergen marked as successfully introduced! 🎉" });
    },
  });

  // Reactions hang off exposure logs, exposure logs off the introduction, so
  // removal always walks child → parent. Explicit deletes rather than relying on
  // FK cascades, which aren't guaranteed on these tables.
  const removeExposure = useMutation({
    mutationFn: async ({
      introId, exposureId, remaining,
    }: {
      introId: string;
      exposureId: string;
      remaining: { logged_at: string; reaction_observed: boolean | null }[];
    }) => {
      assertCanWrite(roleResolved, role);

      const { error: rxError } = await supabase.from("allergen_reactions").delete().eq("exposure_log_id", exposureId);
      if (rxError) throw rxError;
      // An RLS-blocked DELETE returns zero rows and no error — check the
      // returned rows so a blocked delete can't toast success.
      const { data: deletedLogs, error: logError } = await supabase
        .from("allergen_exposure_logs").delete().eq("id", exposureId).select("id");
      if (logError) throw logError;
      if (!deletedLogs?.length) throw new Error("That exposure is no longer yours to remove.");

      const next = introStateAfterExposureRemoval(remaining);
      const { error: introError } = await supabase.from("allergen_introductions").update({
        status: next.status,
        completed_at: next.completed_at,
      }).eq("id", introId);
      if (introError) throw introError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      setUndoExposureOpen(false);
      toast({ title: "Exposure removed", description: "The rest of this protocol is unchanged." });
    },
    onError: (err) => {
      toast({
        title: "Couldn't remove that exposure",
        description: err instanceof Error ? err.message : "Check your connection and try again.",
        variant: "destructive",
      });
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
      if (!deletedIntro?.length) throw new Error("This entry is no longer yours to remove.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      setRemoveEntryOpen(false);
      setSelectedAllergenId(null);
      toast({ title: "Tracking removed", description: "You can start this allergen again whenever you're ready." });
    },
    onError: (err) => {
      toast({
        title: "Couldn't remove this entry",
        description: err instanceof Error ? err.message : "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  const resetReactionForm = () => {
    setSeverity("none");
    setSymptoms([]);
    setReactionNotes("");
    setCurrentExposureIntro(null);
  };

  const getIntro = (allergenId: string) => introductions?.find((i) => i.allergen_id === allergenId);

  // Computed values
  const totalAllergens = allergens?.length ?? 0;
  const introducedCount = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === "introduced").length ?? 0;
  const reactionCount = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === "reaction_noted").length ?? 0;
  const inProgressCount = allergens?.filter((a) => getAllergenStatus(getIntro(a.id)) === "in_progress").length ?? 0;
  const progressPct = totalAllergens > 0 ? Math.round((introducedCount / totalAllergens) * 100) : 0;

  const selectedAllergen = allergens?.find((a) => a.id === selectedAllergenId);
  const selectedIntro = selectedAllergenId ? getIntro(selectedAllergenId) : undefined;

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
    const statusCfg = getStatusConfig(status);
    const exposures = intro?.allergen_exposure_logs ?? [];
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
                <p className="text-[10px] text-muted-foreground/70 mt-2">
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
                  <p className="text-xs text-muted-foreground">Offer a small amount and watch for 2 hours for any immediate reaction.</p>
                  {sortedExposures[0] && (
                    <p className="text-xs text-success mt-1.5 font-semibold">
                      ✓ Logged {format(new Date(sortedExposures[0].logged_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
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
                  <p className="text-xs text-muted-foreground">Monitor for delayed reactions before the second exposure.</p>
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
                  {sortedExposures[1] && (
                    <p className="text-xs text-success mt-1.5 font-semibold">
                      ✓ Logged {format(new Date(sortedExposures[1].logged_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
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
                     "Mark as Introduced or Flag for Review"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {status === "introduced" ? `${selectedAllergen.name} is now part of ${activeChild.name}'s diet.` :
                     status === "reaction_noted" ? "A reaction was noted. Share this report with your pediatrician." :
                     "Complete the protocol to determine next steps."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action buttons */}
        {status === "not_started" && (
          <Button
            className="w-full touch-target h-14 text-base font-bold gap-2 bg-feeding hover:bg-feeding/90"
            onClick={() => startIntro.mutate(selectedAllergen.id)}
            disabled={startIntro.isPending}
          >
            <Play className="w-5 h-5" /> Start First Exposure
          </Button>
        )}

        {status === "in_progress" && sortedExposures.length >= 1 && canLogNext && (
          <Button
            className="w-full touch-target h-14 text-base font-bold gap-2 bg-warning hover:bg-warning/90 text-warning-foreground"
            onClick={() => {
              setCurrentExposureIntro({
                introId: intro!.id,
                allergenId: selectedAllergen.id,
                exposureNum: sortedExposures.length + 1,
              });
              setReactionDialog(true);
            }}
          >
            <Clock className="w-5 h-5" /> Log Exposure #{sortedExposures.length + 1}
          </Button>
        )}

        {status === "in_progress" && sortedExposures.length >= 2 && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="touch-target h-12 gap-1 bg-success hover:bg-success/90 text-success-foreground font-bold"
              onClick={() => markIntroduced.mutate(intro!.id)}
            >
              <Check className="w-4 h-4" /> Successfully Introduced
            </Button>
            <Button
              variant="outline"
              className="touch-target h-12 gap-1 border-destructive/30 text-destructive font-bold"
              onClick={() => {
                setCurrentExposureIntro({
                  introId: intro!.id,
                  allergenId: selectedAllergen.id,
                  exposureNum: sortedExposures.length + 1,
                });
                setSeverity("mild");
                setReactionDialog(true);
              }}
            >
              <Stethoscope className="w-4 h-4" /> Flag for Review
            </Button>
          </div>
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
                    <p className="text-[10px] text-muted-foreground">{format(new Date(rx.observed_at), "MMM d, h:mm a")}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rx.symptoms?.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
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
        {allergens?.map((allergen) => {
          const intro = getIntro(allergen.id);
          const status = getAllergenStatus(intro);
          const statusCfg = getStatusConfig(status);
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

                {/* Protocol progress dots */}
                {status !== "not_started" && (
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

      {/* ─── REACTION LOGGING DIALOG ─── */}
      <Dialog open={reactionDialog} onOpenChange={(open) => { setReactionDialog(open); if (!open) resetReactionForm(); }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Log Exposure #{currentExposureIntro?.exposureNum}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Severity — large color-coded buttons */}
            <div className="space-y-2">
              <Label className="text-sm font-bold">Any Reaction?</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(severityConfig) as [Severity, typeof severityConfig.none][]).map(([key, cfg]) => (
                  <Button
                    key={key}
                    variant="outline"
                    className={cn(
                      "touch-target h-14 text-sm font-bold transition-all",
                      severity === key ? cfg.activeColor : cfg.color
                    )}
                    onClick={() => setSeverity(key)}
                  >
                    <span className="text-lg mr-1">{cfg.emoji}</span> {cfg.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Symptoms — checkboxes */}
            {severity !== "none" && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-bold">Symptoms Observed</Label>
                  <div className="flex flex-wrap gap-2">
                    {symptomOptions.map((sym) => (
                      <Button
                        key={sym}
                        variant={symptoms.includes(sym) ? "default" : "outline"}
                        size="sm"
                        className={cn("text-xs capitalize touch-target",
                          symptoms.includes(sym) && "bg-destructive/80 hover:bg-destructive"
                        )}
                        onClick={() => setSymptoms(prev =>
                          prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
                        )}
                      >
                        {sym}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Verbatim notes — never summarize or interpret */}
                <div className="space-y-1">
                  <Label className="text-sm font-bold">Describe What You Observed</Label>
                  <Textarea
                    value={reactionNotes}
                    onChange={(e) => setReactionNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe exactly what you saw — timing, severity, how your child responded..."
                    className="text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">Your description will be stored exactly as written for your pediatrician.</p>
                </div>

                {/* CLINICAL REVIEW NEEDED: Alert thresholds per AAAAI/AAP */}
                {(severity === "moderate" || severity === "severe") && (
                  <Card className={cn("border-0", severity === "severe" ? "bg-destructive/15" : "bg-warning/15")}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={cn("w-5 h-5 shrink-0 mt-0.5",
                          severity === "severe" ? "text-destructive" : "text-warning"
                        )} />
                        <div>
                          <p className={cn("text-sm font-bold",
                            severity === "severe" ? "text-destructive" : "text-warning"
                          )}>
                            {severity === "severe"
                              ? "These symptoms may need immediate attention"
                              : "Consider contacting your pediatrician"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {severity === "severe"
                              ? "If your child is having difficulty breathing, swelling of the face or throat, or seems very unwell, call 911 immediately."
                              : "These symptoms may need medical attention. Consider calling your pediatrician to discuss what you're observing."}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Button
              className="w-full touch-target h-12 text-base font-bold"
              onClick={() => currentExposureIntro && logExposure.mutate(currentExposureIntro)}
              disabled={logExposure.isPending || (severity !== "none" && symptoms.length === 0)}
            >
              {logExposure.isPending ? "Saving..." : "Save Exposure"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
