import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UtensilsCrossed, AlertTriangle, Check, Clock, Play, Search, ShieldCheck, Eye, Leaf, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { AddChildDialog } from "@/components/AddChildDialog";
import { AllergenInsightCard } from "@/components/allergens/AllergenInsightCard";

const severityLevels = ["none", "mild", "moderate", "severe"];
const symptomOptions = ["rash", "hives", "vomiting", "swelling", "breathing difficulty", "diarrhea", "fussiness"];

function getStatusInfo(intro: any) {
  if (!intro) return { label: "Not Started", variant: "secondary" as const, color: "text-muted-foreground" };

  const hasReaction = intro.allergen_exposure_logs?.some((l: any) => l.reaction_observed);
  const firstDate = intro.first_introduced_at ? new Date(intro.first_introduced_at) : null;
  const daysSince = firstDate ? differenceInDays(new Date(), firstDate) : 0;

  // Use explicit status field per protocol
  if (intro.status === "completed" || intro.status === "completed/safe") {
    return { label: "Established", variant: "default" as const, color: "text-success", daysSince, hasReaction };
  }

  if (daysSince >= 7) {
    return { label: "Established", variant: "default" as const, color: "text-success", daysSince, hasReaction };
  }

  if (daysSince >= 1) {
    return { label: "Monitoring", variant: "outline" as const, color: "text-warning", daysSince, hasReaction };
  }

  return { label: "Introduced", variant: "outline" as const, color: "text-primary", daysSince, hasReaction };
}

export default function AllergensPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAllergen, setSelectedAllergen] = useState<any>(null);
  const [reactionDialog, setReactionDialog] = useState(false);
  const [severity, setSeverity] = useState("none");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [reactionNotes, setReactionNotes] = useState("");

  const { data: allergens } = useQuery({
    queryKey: ["allergens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allergens").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: introductions } = useQuery({
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
        .select("*, allergen_exposure_logs!inner(allergen_id)")
        .eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      toast({ title: "Allergen introduction started! 🥜" });
    },
  });

  const logExposure = useMutation({
    mutationFn: async ({ introId, allergenId, exposureNum }: { introId: string; allergenId: string; exposureNum: number }) => {
      await supabase.from("allergen_exposure_logs").insert({
        allergen_id: allergenId,
        allergen_introduction_id: introId,
        child_id: activeChild!.id,
        parent_id: user!.id,
        exposure_number: exposureNum,
        reaction_observed: severity !== "none",
      });
      if (severity !== "none") {
        const { data: latestLog } = await supabase.from("allergen_exposure_logs")
          .select("id").eq("allergen_introduction_id", introId).order("created_at", { ascending: false }).limit(1).single();
        if (latestLog) {
          await supabase.from("allergen_reactions").insert({
            exposure_log_id: latestLog.id,
            child_id: activeChild!.id,
            parent_id: user!.id,
            severity,
            symptoms,
            parent_description: reactionNotes || `${severity} reaction observed`,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allergen-introductions"] });
      queryClient.invalidateQueries({ queryKey: ["allergen-reactions"] });
      setReactionDialog(false);
      setSeverity("none"); setSymptoms([]); setReactionNotes("");
      toast({ title: "Exposure logged! ✅" });
    },
  });

  const getIntro = (allergenId: string) => introductions?.find((i) => i.allergen_id === allergenId);

  const hasReactionForAllergen = (allergenId: string) => {
    const intro = getIntro(allergenId);
    if (intro?.allergen_exposure_logs?.some((l: any) => l.reaction_observed)) return true;
    return reactions?.some((r: any) => r.allergen_exposure_logs?.allergen_id === allergenId);
  };

  // Check if any allergen was introduced < 4 days ago
  const showTimingBanner = useMemo(() => {
    if (!introductions) return false;
    return introductions.some(intro => {
      if (!intro.first_introduced_at) return false;
      return differenceInDays(new Date(), new Date(intro.first_introduced_at)) < 4;
    });
  }, [introductions]);

  const filteredAllergens = useMemo(() => {
    if (!allergens) return [];
    if (!searchQuery.trim()) return allergens;
    const q = searchQuery.toLowerCase();
    return allergens.filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
  }, [allergens, searchQuery]);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-accent" /> Allergen Introduction
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking allergens.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-accent" /> Allergen Introduction
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name}'s allergen protocol
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" /> This is guidance only. Always consult your pediatrician before introducing allergens.
        </p>
      </div>

      {/* Timing banner */}
      {showTimingBanner && (
        <Card className="border-0 bg-accent/10">
          <CardContent className="p-3 flex items-start gap-3">
            <Leaf className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/80 leading-relaxed">
              Remember: wait at least 3–5 days between new allergens to identify any reactions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search / filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search allergens..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-secondary border-0"
        />
      </div>

      {/* Allergen status cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filteredAllergens.map((allergen) => {
          const intro = getIntro(allergen.id);
          const exposureCount = intro?.allergen_exposure_logs?.length ?? 0;
          const status = getStatusInfo(intro);
          const hasReaction = hasReactionForAllergen(allergen.id);
          const firstDate = intro?.first_introduced_at ? new Date(intro.first_introduced_at) : null;
          const isStarted = !!intro;
          const isComplete = status.label === "Established";

          return (
            <Card key={allergen.id} className={cn(
              "border-0 transition-colors",
              isComplete ? "bg-success/8" : isStarted ? "bg-warning/8" : "bg-secondary"
            )}>
              <CardContent className="p-4 space-y-3">
                {/* Top row: name + status badge */}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">{allergen.name}</h3>
                  {isStarted ? (
                    <Badge
                      variant={status.variant}
                      className={cn(
                        "text-[10px] shrink-0",
                        status.label === "Established" && "bg-success/15 text-success border-success/20",
                        status.label === "Monitoring" && "bg-warning/15 text-warning border-warning/20",
                        status.label === "Introduced" && "bg-primary/15 text-primary border-primary/20",
                      )}
                    >
                      {status.label === "Established" && <ShieldCheck className="w-3 h-3 mr-1" />}
                      {status.label === "Monitoring" && <Eye className="w-3 h-3 mr-1" />}
                      {status.label === "Introduced" && <Check className="w-3 h-3 mr-1" />}
                      {status.label}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] shrink-0">{allergen.category}</Badge>
                  )}
                </div>

                {/* Date & days info */}
                {isStarted && firstDate && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Started {format(firstDate, "MMM d, yyyy")}</span>
                    <span className="text-foreground/50">·</span>
                    <span>{status.daysSince === 0 ? "Today" : `${status.daysSince} day${status.daysSince !== 1 ? "s" : ""} ago`}</span>
                  </div>
                )}

                {/* Exposure count */}
                {isStarted && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{exposureCount} exposure{exposureCount !== 1 ? "s" : ""} logged</span>
                  </div>
                )}

                {/* Reaction caution note */}
                {hasReaction && (
                  <div className="rounded-lg bg-warning/10 px-3 py-2 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/70 leading-relaxed">
                      Reaction noted — discuss with your pediatrician at your next visit.
                    </p>
                  </div>
                )}

                {/* Actions */}
                {!isStarted && (
                  <Button size="sm" className="w-full touch-target text-xs gap-1.5" variant="outline" onClick={() => startIntro.mutate(allergen.id)}>
                    <Play className="w-3 h-3" /> Start Introduction
                  </Button>
                )}

                {isStarted && !isComplete && (
                  <Button
                    size="sm"
                    className="w-full touch-target text-xs gap-1.5 bg-warning/15 hover:bg-warning/25 text-warning border-0"
                    variant="outline"
                    onClick={() => {
                      setSelectedAllergen({ ...allergen, introId: intro!.id, nextExposure: exposureCount + 1 });
                      setReactionDialog(true);
                    }}
                  >
                    <Clock className="w-3 h-3" /> Log Exposure (Day {exposureCount + 1})
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredAllergens.length === 0 && searchQuery && (
        <p className="text-sm text-muted-foreground text-center py-6">No allergens matching "{searchQuery}"</p>
      )}

      {/* Reaction logging dialog */}
      <Dialog open={reactionDialog} onOpenChange={setReactionDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Log Exposure — {selectedAllergen?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reaction Severity</Label>
              <div className="grid grid-cols-2 gap-2">
                {severityLevels.map((s) => (
                  <Button key={s} variant={severity === s ? "default" : "outline"} size="sm" className={cn("capitalize touch-target", severity === s && s === "severe" && "bg-destructive")} onClick={() => setSeverity(s)}>
                    {s === "none" ? "✅ None" : s === "mild" ? "🟡 Mild" : s === "moderate" ? "🟠 Moderate" : "🔴 Severe"}
                  </Button>
                ))}
              </div>
            </div>

            {severity !== "none" && (
              <>
                <div className="space-y-2">
                  <Label>Symptoms</Label>
                  <div className="flex flex-wrap gap-2">
                    {symptomOptions.map((sym) => (
                      <Button key={sym} variant={symptoms.includes(sym) ? "default" : "outline"} size="sm" className="text-xs capitalize touch-target"
                        onClick={() => setSymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym])}>
                        {sym}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea value={reactionNotes} onChange={(e) => setReactionNotes(e.target.value)} rows={2} placeholder="Describe what you observed..." />
                </div>

                {severity === "severe" && (
                  <Card className="border-0 bg-destructive/10">
                    <CardContent className="p-3">
                      <p className="text-xs text-destructive font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> If your child is having difficulty breathing, call 911 immediately.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Button
              className="w-full touch-target"
              onClick={() => selectedAllergen && logExposure.mutate({
                introId: selectedAllergen.introId,
                allergenId: selectedAllergen.id,
                exposureNum: selectedAllergen.nextExposure,
              })}
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
