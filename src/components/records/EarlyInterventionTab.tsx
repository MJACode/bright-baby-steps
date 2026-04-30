import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, AlertTriangle, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, addYears, differenceInMonths } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type Provider = Tables<"ei_providers">;

interface Props {
  childId: string;
  parentId: string;
  childName: string;
  childDob: string;
}

const STATUS_STAGES = [
  { value: "referred", label: "Referred" },
  { value: "intake_scheduled", label: "Intake Scheduled" },
  { value: "eval_scheduled", label: "Evaluation" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
];

const ELIGIBILITY_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "eligible", label: "Eligible" },
  { value: "not_eligible", label: "Not eligible" },
];

function stageIndex(status: string | null): number {
  const idx = STATUS_STAGES.findIndex((s) => s.value === status);
  return idx === -1 ? -1 : idx;
}

export function EarlyInterventionTab({ childId, parentId, childName, childDob }: Props) {
  const queryClient = useQueryClient();
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);

  const [trackerForm, setTrackerForm] = useState({
    referral_date: "",
    ei_program_name: "",
    intake_date: "",
    status: "referred",
    eval_date: "",
    eligibility: "pending",
    ifsp_start_date: "",
    ifsp_review_date: "",
    services_summary: "",
    notes: "",
  });

  const [providerForm, setProviderForm] = useState({
    name: "",
    role: "",
    contact: "",
    notes: "",
  });

  const { data: tracker } = useQuery({
    queryKey: ["ei-tracker", childId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ei_tracker").select("*").eq("child_id", childId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["ei-providers", tracker?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ei_providers").select("*").eq("ei_tracker_id", tracker!.id).order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!tracker?.id,
  });

  useEffect(() => {
    if (tracker) {
      const services = tracker.services_json && typeof tracker.services_json === "object" && "summary" in tracker.services_json
        ? String((tracker.services_json as Record<string, unknown>).summary ?? "")
        : "";
      setTrackerForm({
        referral_date: tracker.referral_date ?? "",
        ei_program_name: tracker.ei_program_name ?? "",
        intake_date: tracker.intake_date ?? "",
        status: tracker.status ?? "referred",
        eval_date: tracker.eval_date ?? "",
        eligibility: tracker.eligibility ?? "pending",
        ifsp_start_date: tracker.ifsp_start_date ?? "",
        ifsp_review_date: tracker.ifsp_review_date ?? "",
        services_summary: services,
        notes: tracker.notes ?? "",
      });
    }
  }, [tracker]);

  const upsertTracker = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ei_tracker").upsert({
        child_id: childId,
        parent_id: parentId,
        referral_date: trackerForm.referral_date || null,
        ei_program_name: trackerForm.ei_program_name.trim() || null,
        intake_date: trackerForm.intake_date || null,
        status: trackerForm.status,
        eval_date: trackerForm.eval_date || null,
        eligibility: trackerForm.eligibility,
        ifsp_start_date: trackerForm.ifsp_start_date || null,
        ifsp_review_date: trackerForm.ifsp_review_date || null,
        services_json: trackerForm.services_summary.trim() ? { summary: trackerForm.services_summary.trim() } : null,
        notes: trackerForm.notes.trim() || null,
      }, { onConflict: "child_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ei-tracker", childId] });
      setTrackerOpen(false);
      toast({ title: "EI tracker saved" });
    },
  });

  const upsertProvider = useMutation({
    mutationFn: async () => {
      if (!tracker?.id) throw new Error("Save the EI tracker first");
      const payload = {
        ei_tracker_id: tracker.id,
        parent_id: parentId,
        name: providerForm.name.trim(),
        role: providerForm.role.trim() || null,
        contact: providerForm.contact.trim() || null,
        notes: providerForm.notes.trim() || null,
      };
      if (editingProviderId) {
        const { error } = await supabase.from("ei_providers").update(payload).eq("id", editingProviderId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ei_providers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ei-providers", tracker?.id] });
      setProviderOpen(false);
      setEditingProviderId(null);
      toast({ title: "Provider saved" });
    },
  });

  const deleteProvider = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ei_providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ei-providers", tracker?.id] }),
  });

  const openProviderEdit = (p?: Provider) => {
    if (p) {
      setEditingProviderId(p.id);
      setProviderForm({ name: p.name, role: p.role ?? "", contact: p.contact ?? "", notes: p.notes ?? "" });
    } else {
      setEditingProviderId(null);
      setProviderForm({ name: "", role: "", contact: "", notes: "" });
    }
    setProviderOpen(true);
  };

  const currentStage = stageIndex(tracker?.status ?? null);
  const thirdBirthday = childDob ? addYears(new Date(childDob), 3) : null;
  const monthsUntilThird = thirdBirthday ? differenceInMonths(thirdBirthday, new Date()) : null;

  type TransitionTier = { level: "info" | "warning" | "urgent"; container: string; iconColor: string; textColor: string; lead: string };
  const transitionTier: TransitionTier | null = (() => {
    if (tracker?.status !== "active" || monthsUntilThird == null) return null;
    if (monthsUntilThird <= 1) {
      return {
        level: "urgent",
        container: "border-red-300 bg-red-50",
        iconColor: "text-red-600",
        textColor: "text-red-900",
        lead: "Transition is imminent.",
      };
    }
    if (monthsUntilThird <= 3) {
      return {
        level: "warning",
        container: "border-orange-300 bg-orange-50",
        iconColor: "text-orange-600",
        textColor: "text-orange-900",
        lead: "Transition window open.",
      };
    }
    if (monthsUntilThird <= 6) {
      return {
        level: "info",
        container: "border-blue-300 bg-blue-50",
        iconColor: "text-blue-600",
        textColor: "text-blue-900",
        lead: "Transition planning starts now.",
      };
    }
    return null;
  })();

  if (!tracker) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-lg">Early Intervention</h3>
        </div>
        <Card className="border-0 bg-muted/40">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Early Intervention is a federal program (IDEA Part C) for children under 3 with developmental concerns.
              Anyone can refer — including a parent — and an evaluation is free.
            </p>
            <Button className="w-full touch-target" onClick={() => setTrackerOpen(true)}>
              Start Tracking EI
            </Button>
          </CardContent>
        </Card>

        <TrackerSheet
          open={trackerOpen}
          onOpenChange={setTrackerOpen}
          form={trackerForm}
          setForm={setTrackerForm}
          isPending={upsertTracker.isPending}
          onSave={() => upsertTracker.mutate()}
          isNew
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-lg">Early Intervention</h3>
        <Button variant="ghost" size="sm" onClick={() => setTrackerOpen(true)}>
          <Pencil className="w-4 h-4" />
        </Button>
      </div>

      {transitionTier && thirdBirthday && (
        <Alert className={transitionTier.container}>
          <AlertTriangle className={`h-4 w-4 ${transitionTier.iconColor}`} />
          <AlertDescription className={`text-sm ${transitionTier.textColor}`}>
            <span className="font-semibold">{transitionTier.lead}</span>
            {" "}{childName}'s EI services end on {format(thirdBirthday, "MMM d, yyyy")}.
            {transitionTier.level === "info" && " Now is a good time to start the IDEA Part B conversation with your service coordinator."}
            {transitionTier.level === "warning" && " Schedule the IDEA Part B evaluation with your school district — it can take weeks."}
            {transitionTier.level === "urgent" && " Confirm the IDEA Part B handoff is in motion. Services lapse on the 3rd birthday unless Part B is in place."}
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-0 bg-muted/40">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Process</p>
          <ol className="space-y-3">
            {STATUS_STAGES.map((stage, idx) => {
              const isCurrent = idx === currentStage;
              const isComplete = idx < currentStage;
              return (
                <li key={stage.value} className="flex items-center gap-3">
                  <span
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                      isComplete ? "bg-green-200 text-green-900" :
                      isCurrent ? "bg-primary text-primary-foreground" :
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isComplete ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </span>
                  <span className={`text-sm ${isCurrent ? "font-bold" : isComplete ? "text-foreground/80" : "text-muted-foreground"}`}>
                    {stage.label}
                  </span>
                </li>
              );
            })}
          </ol>
          {tracker.eligibility && (
            <p className="text-xs text-muted-foreground mt-3">
              Eligibility: <span className="font-semibold">{ELIGIBILITY_OPTIONS.find((e) => e.value === tracker.eligibility)?.label}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 bg-muted/40">
        <CardContent className="p-4 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">IFSP details</p>
          {tracker.ei_program_name && <p className="text-xs"><span className="font-semibold">Program:</span> {tracker.ei_program_name}</p>}
          {tracker.referral_date && <p className="text-xs"><span className="font-semibold">Referred:</span> {format(new Date(tracker.referral_date), "MMM d, yyyy")}</p>}
          {tracker.intake_date && <p className="text-xs"><span className="font-semibold">Intake:</span> {format(new Date(tracker.intake_date), "MMM d, yyyy")}</p>}
          {tracker.eval_date && <p className="text-xs"><span className="font-semibold">Evaluation:</span> {format(new Date(tracker.eval_date), "MMM d, yyyy")}</p>}
          {tracker.ifsp_start_date && <p className="text-xs"><span className="font-semibold">IFSP start:</span> {format(new Date(tracker.ifsp_start_date), "MMM d, yyyy")}</p>}
          {tracker.ifsp_review_date && <p className="text-xs"><span className="font-semibold">Next review:</span> {format(new Date(tracker.ifsp_review_date), "MMM d, yyyy")}</p>}
          {tracker.services_json && typeof tracker.services_json === "object" && "summary" in tracker.services_json && (
            <div className="pt-1">
              <p className="text-xs font-semibold">Services:</p>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{String((tracker.services_json as Record<string, unknown>).summary)}</p>
            </div>
          )}
          {tracker.notes && (
            <div className="pt-1">
              <p className="text-xs font-semibold">Notes:</p>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{tracker.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">EI Providers</p>
        {providers && providers.length > 0 ? (
          providers.map((p) => (
            <Card key={p.id} className="border-0 bg-muted/40">
              <CardContent className="p-3 flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold">{p.name}{p.role ? ` • ${p.role}` : ""}</p>
                  {p.contact && <p className="text-xs text-muted-foreground">{p.contact}</p>}
                  {p.notes && <p className="text-xs text-foreground/80">{p.notes}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openProviderEdit(p)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteProvider.mutate(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-xs text-muted-foreground italic">No providers logged yet.</p>
        )}

        <Button variant="outline" size="sm" className="w-full gap-2 touch-target" onClick={() => openProviderEdit()}>
          <Plus className="w-4 h-4" /> Add Provider
        </Button>
      </div>

      <TrackerSheet
        open={trackerOpen}
        onOpenChange={setTrackerOpen}
        form={trackerForm}
        setForm={setTrackerForm}
        isPending={upsertTracker.isPending}
        onSave={() => upsertTracker.mutate()}
      />

      <Sheet open={providerOpen} onOpenChange={setProviderOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">{editingProviderId ? "Edit Provider" : "Add EI Provider"}</SheetTitle>
            <SheetDescription>Track speech, OT, PT, service coordinator, etc.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Name</Label>
              <Input value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Role</Label>
              <Input value={providerForm.role} onChange={(e) => setProviderForm({ ...providerForm, role: e.target.value })} placeholder="e.g. Speech-Language Pathologist" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Contact</Label>
              <Input value={providerForm.contact} onChange={(e) => setProviderForm({ ...providerForm, contact: e.target.value })} placeholder="Phone or email" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea value={providerForm.notes} onChange={(e) => setProviderForm({ ...providerForm, notes: e.target.value })} />
            </div>
            <Button
              className="w-full h-12 touch-target"
              disabled={!providerForm.name.trim() || upsertProvider.isPending}
              onClick={() => upsertProvider.mutate()}
            >
              {upsertProvider.isPending ? "Saving..." : "Save Provider"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface TrackerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: {
    referral_date: string;
    ei_program_name: string;
    intake_date: string;
    status: string;
    eval_date: string;
    eligibility: string;
    ifsp_start_date: string;
    ifsp_review_date: string;
    services_summary: string;
    notes: string;
  };
  setForm: (form: TrackerSheetProps["form"]) => void;
  isPending: boolean;
  onSave: () => void;
  isNew?: boolean;
}

function TrackerSheet({ open, onOpenChange, form, setForm, isPending, onSave, isNew }: TrackerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">{isNew ? "Start EI Tracking" : "Edit EI Tracker"}</SheetTitle>
          <SheetDescription>Record where you are in the EI process and what's coming up.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">EI program name</Label>
            <Input value={form.ei_program_name} onChange={(e) => setForm({ ...form, ei_program_name: e.target.value })} placeholder="e.g. Massachusetts Early Intervention" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Referral date</Label>
              <Input type="date" value={form.referral_date} onChange={(e) => setForm({ ...form, referral_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Intake date</Label>
              <Input type="date" value={form.intake_date} onChange={(e) => setForm({ ...form, intake_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Eligibility</Label>
              <Select value={form.eligibility} onValueChange={(v) => setForm({ ...form, eligibility: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ELIGIBILITY_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Evaluation date</Label>
            <Input type="date" value={form.eval_date} onChange={(e) => setForm({ ...form, eval_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">IFSP start</Label>
              <Input type="date" value={form.ifsp_start_date} onChange={(e) => setForm({ ...form, ifsp_start_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">IFSP next review</Label>
              <Input type="date" value={form.ifsp_review_date} onChange={(e) => setForm({ ...form, ifsp_review_date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Services summary</Label>
            <Textarea value={form.services_summary} onChange={(e) => setForm({ ...form, services_summary: e.target.value })} placeholder="e.g. Speech 1x/week, OT 1x/week" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button className="w-full h-12 touch-target" disabled={isPending} onClick={onSave}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
