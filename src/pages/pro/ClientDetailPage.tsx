import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronDown,
  Pencil,
  Archive,
  Sparkles,
  Loader2,
  Plus,
  Copy,
  Link2,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WeeklyPlanView } from "@/components/WeeklyPlanView";
import { ProGate } from "@/components/pro/ProGate";
import { AddClientDialog } from "@/components/pro/AddClientDialog";
import { ShareLinkDialog } from "@/components/pro/ShareLinkDialog";
import {
  useSlpClient,
  useArchiveSlpClient,
  formatClientAge,
  type SlpClient,
} from "@/hooks/pro/useSlpClients";
import {
  useClientGoals,
  useAddClientGoal,
  useUpdateGoalStatus,
  type SlpClientGoal,
} from "@/hooks/pro/useClientGoals";
import { useSessionPlans, useAddSessionPlan } from "@/hooks/pro/useSessionPlans";
import { useHomePrograms, useCreateHomeProgram, type SlpHomeProgramRow } from "@/hooks/pro/useHomePrograms";
import {
  useProGenerate,
  ProRequiredError,
  ProProfileRequiredError,
  type SessionPlanDraft,
  type GoalDraftsResponse,
  type HomeProgramPlan,
  type GoalArea,
  type SessionSetting,
} from "@/hooks/pro/useProGenerate";

const PRO_VERDICT_COPY: Record<SessionPlanDraft["ageCheck"]["verdict"], string> = {
  too_early: "Below typical window",
  in_window: "Within typical window",
  past_window: "Past typical window",
};

const GOAL_AREAS: { value: GoalArea; label: string }[] = [
  { value: "expressive", label: "Expressive language" },
  { value: "receptive", label: "Receptive language" },
  { value: "articulation", label: "Articulation" },
  { value: "pragmatics", label: "Pragmatics" },
  { value: "fluency", label: "Fluency" },
  { value: "mixed", label: "Mixed" },
];

const SETTINGS: { value: SessionSetting; label: string }[] = [
  { value: "clinic", label: "Clinic" },
  { value: "school", label: "School" },
  { value: "teletherapy", label: "Teletherapy" },
  { value: "home", label: "Home" },
];

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useSlpClient(clientId);
  const archiveClient = useArchiveSlpClient();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This client isn't in your caseload — they may have been archived.
        </p>
        <Button asChild variant="outline" className="min-h-[48px] rounded-xl">
          <Link to="/pro/dashboard">Back to caseload</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        to="/pro/dashboard"
        className="inline-flex items-center gap-0.5 min-h-[48px] -mt-3 -ml-2 pl-1 pr-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-5 h-5" /> Caseload
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{client.display_name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{formatClientAge(client.age_months)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="touch-target text-muted-foreground"
            onClick={() => setEditOpen(true)}
            aria-label="Edit client"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="touch-target text-muted-foreground"
                aria-label="Archive client"
              >
                <Archive className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">
                  Archive {client.display_name}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Archiving removes them from your caseload list. Their goals, plans, and home
                  programs stay stored, and active share links keep working until they expire or
                  you revoke them.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-[48px] rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-[48px] rounded-xl"
                  onClick={() =>
                    archiveClient.mutate(client.id, {
                      onSuccess: () => {
                        toast.success(`${client.display_name} archived.`);
                        navigate("/pro/dashboard");
                      },
                    })
                  }
                >
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue="goals">
        <TabsList className="w-full grid grid-cols-3 min-h-[48px]">
          <TabsTrigger value="goals" className="min-h-[40px]">Goals</TabsTrigger>
          <TabsTrigger value="plans" className="min-h-[40px]">Session plans</TabsTrigger>
          <TabsTrigger value="home" className="min-h-[40px]">Home program</TabsTrigger>
        </TabsList>
        <TabsContent value="goals" className="mt-4">
          <GoalsTab client={client} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <SessionPlansTab client={client} />
        </TabsContent>
        <TabsContent value="home" className="mt-4">
          <HomeProgramTab client={client} />
        </TabsContent>
      </Tabs>

      <AddClientDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
    </div>
  );
}

/** Shared error routing for pro-generate calls (defense-in-depth server gate). */
function useGenerateErrorHandler() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (err: unknown) => {
    if (err instanceof ProRequiredError) {
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      toast.error("Your Pro access has ended. Restart it to keep drafting.");
      navigate("/pro/upgrade");
    } else if (err instanceof ProProfileRequiredError) {
      toast.error("Finish your professional profile to use AI drafting.");
    } else {
      toast.error("Couldn't build the draft. Please try again in a moment.");
    }
  };
}

function activeGoalTexts(goals: SlpClientGoal[] | undefined): string[] {
  return (goals ?? []).filter((g) => g.status === "active").map((g) => g.goal_text);
}

// ── Goals tab ────────────────────────────────────────────────────────────────

const GOAL_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-primary/10 text-primary" },
  met: { label: "Met", className: "bg-success/10 text-success" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
};

function GoalsTab({ client }: { client: SlpClient }) {
  const { data: goals, isLoading } = useClientGoals(client.id);
  const addGoal = useAddClientGoal();
  const updateStatus = useUpdateGoalStatus();
  const generate = useProGenerate();
  const onGenerateError = useGenerateErrorHandler();

  const [manualText, setManualText] = useState("");
  const [area, setArea] = useState<GoalArea>("mixed");
  const [timeframe, setTimeframe] = useState("");
  const [drafts, setDrafts] = useState<GoalDraftsResponse | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const handleManualAdd = () => {
    if (!manualText.trim()) return;
    addGoal.mutate(
      { clientId: client.id, goalText: manualText, source: "manual" },
      {
        onSuccess: () => {
          setManualText("");
          toast.success("Goal added.");
        },
      }
    );
  };

  const handleDraft = () => {
    generate.mutate(
      {
        kind: "goals",
        displayName: client.display_name,
        ageMonths: client.age_months,
        goals: activeGoalTexts(goals),
        area,
        timeframe: timeframe.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          setDrafts(result as GoalDraftsResponse);
          setSavedDrafts(new Set());
        },
        onError: onGenerateError,
      }
    );
  };

  const saveDraft = (idx: number, draft: GoalDraftsResponse["goals"][number]) => {
    addGoal.mutate(
      { clientId: client.id, goalText: draft.goalText, source: "ai" },
      {
        onSuccess: () => setSavedDrafts((prev) => new Set(prev).add(idx)),
      }
    );
  };

  const saveAll = async () => {
    if (!drafts) return;
    setSavingAll(true);
    try {
      for (const [idx, draft] of drafts.goals.entries()) {
        if (savedDrafts.has(idx)) continue;
        await addGoal.mutateAsync({ clientId: client.id, goalText: draft.goalText, source: "ai" });
        setSavedDrafts((prev) => new Set(prev).add(idx));
      }
      toast.success("All drafted goals saved.");
    } catch {
      // useAddClientGoal's onError already surfaced the failure.
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="space-y-5">
      {isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : !goals || goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No goals on file yet. Add one below, or draft a starting set with AI.
        </p>
      ) : (
        <ul className="space-y-2">
          {goals.map((goal) => {
            const badge = GOAL_STATUS_BADGE[goal.status] ?? GOAL_STATUS_BADGE.active;
            return (
              <li key={goal.id}>
                <Card className={goal.status !== "active" ? "opacity-70" : undefined}>
                  <CardContent className="p-3.5 space-y-2">
                    <p className="text-sm leading-snug">{goal.goal_text}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={`text-[10px] uppercase tracking-wide ${badge.className}`}>
                        {badge.label}
                      </Badge>
                      {goal.source === "ai" && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          <Sparkles className="w-2.5 h-2.5 mr-1" /> AI draft
                        </Badge>
                      )}
                      <span className="flex-1" />
                      {goal.status === "active" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[48px] rounded-xl"
                            disabled={updateStatus.isPending}
                            onClick={() =>
                              updateStatus.mutate({ goalId: goal.id, clientId: client.id, status: "met" })
                            }
                          >
                            Mark met
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-[48px] rounded-xl text-muted-foreground"
                            disabled={updateStatus.isPending}
                            onClick={() =>
                              updateStatus.mutate({ goalId: goal.id, clientId: client.id, status: "archived" })
                            }
                          >
                            Archive
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-[48px] rounded-xl text-muted-foreground"
                          disabled={updateStatus.isPending}
                          onClick={() =>
                            updateStatus.mutate({ goalId: goal.id, clientId: client.id, status: "active" })
                          }
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <Label htmlFor="manual-goal" className="text-sm font-semibold">
          Add a goal
        </Label>
        <Textarea
          id="manual-goal"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          maxLength={1000}
          placeholder="Given moderate verbal cues, [client] will…"
          rows={3}
        />
        <Button
          className="min-h-[48px] rounded-xl font-bold"
          onClick={handleManualAdd}
          disabled={!manualText.trim() || addGoal.isPending}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add goal
        </Button>
      </div>

      <ProGate feature="goal-drafting">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-primary" /> Draft goals with AI
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Goal area</Label>
                <Select value={area} onValueChange={(v) => setArea(v as GoalArea)}>
                  <SelectTrigger className="min-h-[48px] rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_AREAS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-timeframe" className="text-xs">
                  Timeframe (optional)
                </Label>
                <Input
                  id="goal-timeframe"
                  className="min-h-[48px] rounded-xl"
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  placeholder="e.g. by 6 months"
                  maxLength={100}
                />
              </div>
            </div>
            <Button
              className="min-h-[48px] rounded-xl font-bold"
              onClick={handleDraft}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Draft goals with AI
                </>
              )}
            </Button>

            {drafts && (
              <div className="space-y-3 pt-1">
                {drafts.goals.map((draft, idx) => {
                  const saved = savedDrafts.has(idx);
                  return (
                    <Card key={idx} className="bg-background">
                      <CardContent className="p-3.5 space-y-2">
                        <p className="text-sm font-medium leading-snug">{draft.goalText}</p>
                        {draft.shortTermObjectives.length > 0 && (
                          <ul className="list-disc pl-4 space-y-0.5">
                            {draft.shortTermObjectives.map((obj, i) => (
                              <li key={i} className="text-xs text-muted-foreground leading-snug">
                                {obj}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Measurement:</span>{" "}
                          {draft.measurement} · <span className="font-semibold text-foreground">Criterion:</span>{" "}
                          {draft.criterion} · <span className="font-semibold text-foreground">Timeframe:</span>{" "}
                          {draft.timeframe}
                        </p>
                        <Button
                          size="sm"
                          variant={saved ? "secondary" : "default"}
                          className="min-h-[48px] rounded-xl font-semibold"
                          disabled={saved || addGoal.isPending}
                          onClick={() => saveDraft(idx, draft)}
                        >
                          {saved ? "Saved" : "Save goal"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
                <Button
                  variant="outline"
                  className="min-h-[48px] rounded-xl font-semibold"
                  onClick={saveAll}
                  disabled={savingAll || drafts.goals.every((_g, i) => savedDrafts.has(i))}
                >
                  {savingAll ? "Saving…" : "Save all"}
                </Button>
                {drafts.notes && (
                  <p className="text-xs text-muted-foreground leading-snug">
                    <span className="font-semibold text-foreground">Drafting notes:</span> {drafts.notes}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">{drafts.disclaimer}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </ProGate>
    </div>
  );
}

// ── Session plans tab ────────────────────────────────────────────────────────

function SessionPlanView({ plan }: { plan: SessionPlanDraft }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold leading-snug">{plan.focus}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs font-normal">
          {PRO_VERDICT_COPY[plan.ageCheck.verdict] ?? "Age check"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {plan.ageCheck.ageMonths}mo · typical {plan.ageCheck.typicalWindow}
        </span>
      </div>

      <div className="rounded-xl bg-muted/40 p-3 space-y-1">
        <p className="text-sm font-semibold">
          Warm-up · {plan.warmup.name} · {plan.warmup.minutes} min
        </p>
        <p className="text-xs text-muted-foreground leading-snug">{plan.warmup.description}</p>
      </div>

      {plan.activities.map((activity, i) => (
        <div key={i} className="rounded-xl border p-3 space-y-2">
          <p className="text-sm font-semibold">{activity.name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Targets:</span> {activity.targetGoal}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Materials:</span> {activity.materials}
          </p>
          <div>
            <p className="text-xs font-semibold">Steps</p>
            <ol className="list-decimal pl-4 space-y-0.5">
              {activity.steps.map((step, j) => (
                <li key={j} className="text-xs text-muted-foreground leading-snug">
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold">Cueing hierarchy</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {activity.cues.map((cue, j) => (
                <li key={j} className="text-xs text-muted-foreground leading-snug">
                  {cue}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Data collection:</span>{" "}
            {activity.dataCollection}
          </p>
        </div>
      ))}

      <p className="text-xs text-muted-foreground leading-snug">
        <span className="font-semibold text-foreground">Wrap-up:</span> {plan.wrapUp}
      </p>
      <p className="text-xs text-muted-foreground leading-snug">
        <span className="font-semibold text-foreground">Home carryover:</span> {plan.homeCarryover}
      </p>
      <p className="text-[10px] text-muted-foreground">{plan.disclaimer}</p>
    </div>
  );
}

function SessionPlansTab({ client }: { client: SlpClient }) {
  const { data: goals } = useClientGoals(client.id);
  const { data: history, isLoading } = useSessionPlans(client.id);
  const addPlan = useAddSessionPlan();
  const generate = useProGenerate();
  const onGenerateError = useGenerateErrorHandler();

  const [minutes, setMinutes] = useState("30");
  const [setting, setSetting] = useState<SessionSetting>("clinic");
  const [draft, setDraft] = useState<SessionPlanDraft | null>(null);

  const handleGenerate = () => {
    generate.mutate(
      {
        kind: "session_plan",
        displayName: client.display_name,
        ageMonths: client.age_months,
        goals: activeGoalTexts(goals),
        sessionMinutes: Number(minutes),
        setting,
      },
      {
        onSuccess: (result) => setDraft(result as SessionPlanDraft),
        onError: onGenerateError,
      }
    );
  };

  const handleSave = () => {
    if (!draft) return;
    addPlan.mutate(
      { clientId: client.id, plan: draft },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success("Plan saved to history.");
        },
      }
    );
  };

  return (
    <div className="space-y-5">
      <ProGate feature="session-plans">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-primary" /> Generate session plan
            </div>
            <p className="text-xs text-muted-foreground">
              Uses {client.display_name}'s active goals automatically.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Session length</Label>
                <Select value={minutes} onValueChange={setMinutes}>
                  <SelectTrigger className="min-h-[48px] rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["15", "30", "45", "60"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Setting</Label>
                <Select value={setting} onValueChange={(v) => setSetting(v as SessionSetting)}>
                  <SelectTrigger className="min-h-[48px] rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTINGS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="min-h-[48px] rounded-xl font-bold"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Generate session plan
                </>
              )}
            </Button>

            {draft && (
              <Card className="bg-background">
                <CardContent className="p-4 space-y-3">
                  <SessionPlanView plan={draft} />
                  <Button
                    className="min-h-[48px] rounded-xl font-bold"
                    onClick={handleSave}
                    disabled={addPlan.isPending}
                  >
                    {addPlan.isPending ? "Saving…" : "Save to history"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </ProGate>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardList className="w-4 h-4 text-muted-foreground" /> Plan history
        </div>
        {isLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : !history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Saved plans will show up here — generate one above to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((row) => (
              <Collapsible key={row.id}>
                <Card>
                  <CollapsibleTrigger className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left">
                    <span className="text-sm font-semibold">
                      {format(parseISO(row.created_at), "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(parseISO(row.created_at), { addSuffix: true })}
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="px-4 pb-4 pt-0">
                      <SessionPlanView plan={row.plan as unknown as SessionPlanDraft} />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Home program tab ─────────────────────────────────────────────────────────

function programStatus(program: SlpHomeProgramRow): "active" | "revoked" | "expired" {
  if (program.status === "revoked") return "revoked";
  if (parseISO(program.expires_at) <= new Date()) return "expired";
  return "active";
}

const PROGRAM_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-primary/10 text-primary" },
  revoked: { label: "Revoked", className: "bg-muted text-muted-foreground" },
  expired: { label: "Expired", className: "bg-warning/10 text-warning" },
};

function HomeProgramTab({ client }: { client: SlpClient }) {
  const { data: goals } = useClientGoals(client.id);
  const { data: programs, isLoading } = useHomePrograms(client.id);
  const createProgram = useCreateHomeProgram();
  const generate = useProGenerate();
  const onGenerateError = useGenerateErrorHandler();

  const [targetGoalId, setTargetGoalId] = useState("auto");
  const [draft, setDraft] = useState<HomeProgramPlan | null>(null);
  const [shareProgram, setShareProgram] = useState<SlpHomeProgramRow | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const activeGoals = (goals ?? []).filter((g) => g.status === "active");

  const handleGenerate = () => {
    const target = activeGoals.find((g) => g.id === targetGoalId);
    generate.mutate(
      {
        kind: "home_program",
        displayName: client.display_name,
        ageMonths: client.age_months,
        goals: activeGoalTexts(goals),
        targetMilestone: target?.goal_text.slice(0, 300),
      },
      {
        onSuccess: (result) => setDraft(result as HomeProgramPlan),
        onError: onGenerateError,
      }
    );
  };

  const handleCreateLink = () => {
    if (!draft) return;
    createProgram.mutate(
      { clientId: client.id, plan: draft },
      {
        onSuccess: (row) => {
          setDraft(null);
          setShareProgram(row);
          setShareOpen(true);
        },
      }
    );
  };

  const copyLink = async (program: SlpHomeProgramRow) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/hp/${program.share_token}`);
      toast.success("Link copied — ready to send to the family.");
    } catch {
      toast.error("Couldn't copy the link. Open the program to copy it manually.");
    }
  };

  return (
    <div className="space-y-5">
      <ProGate feature="home-programs">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-primary" /> Generate home program
            </div>
            <p className="text-xs text-muted-foreground">
              A one-week, parent-friendly practice plan the family follows from a share link.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Target goal</Label>
              <Select value={targetGoalId} onValueChange={setTargetGoalId}>
                <SelectTrigger className="min-h-[48px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Let AI choose from active goals</SelectItem>
                  {activeGoals.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.goal_text.length > 80 ? `${g.goal_text.slice(0, 80)}…` : g.goal_text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="min-h-[48px] rounded-xl font-bold"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Generate home program
                </>
              )}
            </Button>

            {draft && (
              <div className="space-y-3">
                <Card className="border-accent/30 bg-accent/5">
                  <CardContent className="p-3.5">
                    <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                      Note to the family
                    </p>
                    <p className="text-sm leading-relaxed">{draft.parentNote}</p>
                  </CardContent>
                </Card>
                <WeeklyPlanView
                  plan={draft}
                  completedDays={[]}
                  onToggleDay={() => {}}
                  toggleDisabled
                  ageMonths={draft.ageCheck.correctedAgeMonths ?? draft.ageCheck.ageMonths}
                  isPremature={draft.ageCheck.correctedAgeMonths != null}
                  showDiagnosisNote={false}
                  escalationStyle="contact"
                  disclaimer={draft.disclaimer ?? ""}
                />
                <Button
                  className="min-h-[48px] rounded-xl font-bold"
                  onClick={handleCreateLink}
                  disabled={createProgram.isPending}
                >
                  {createProgram.isPending ? (
                    "Creating…"
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 mr-1.5" /> Create share link
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </ProGate>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Link2 className="w-4 h-4 text-muted-foreground" /> Shared programs
        </div>
        {isLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : !programs || programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Programs you share will show up here with the family's progress.
          </p>
        ) : (
          <div className="space-y-2">
            {programs.map((program) => {
              const status = programStatus(program);
              const badge = PROGRAM_STATUS_BADGE[status];
              return (
                <Card key={program.id}>
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        Week of {format(parseISO(program.week_start), "MMM d, yyyy")}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] uppercase tracking-wide ${badge.className}`}
                        >
                          {badge.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {program.completed_days.length}/7 days done
                        </span>
                      </div>
                    </div>
                    {status === "active" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="touch-target text-muted-foreground"
                          onClick={() => copyLink(program)}
                          aria-label="Copy share link"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[48px] rounded-xl"
                          onClick={() => {
                            setShareProgram(program);
                            setShareOpen(true);
                          }}
                        >
                          Manage
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ShareLinkDialog open={shareOpen} onOpenChange={setShareOpen} program={shareProgram} />
    </div>
  );
}
