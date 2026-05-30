import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Stethoscope, Syringe, Smile, Plus, ChevronDown, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { safeFormatDate } from "@/lib/safeFormat";
import { UpcomingVisitsSection } from "@/components/records/UpcomingVisitsSection";
import { useChildren, isInRetroactiveGracePeriod } from "@/hooks/useChildren";

interface Props {
  childId: string;
  parentId: string;
  ageMonths: number;
}

const VISIT_TYPES = [
  { value: "well", label: "Well visit" },
  { value: "sick", label: "Sick visit" },
  { value: "follow_up", label: "Follow-up" },
];

// CDC pediatric vaccination schedule reference (simplified, by recommended age in months)
const CDC_VACCINE_SCHEDULE: { ageMonths: number; vaccines: string[] }[] = [
  { ageMonths: 0, vaccines: ["Hepatitis B (1st dose)"] },
  { ageMonths: 2, vaccines: ["DTaP (1st)", "Hib (1st)", "IPV (1st)", "PCV13 (1st)", "RV (1st)", "Hepatitis B (2nd)"] },
  { ageMonths: 4, vaccines: ["DTaP (2nd)", "Hib (2nd)", "IPV (2nd)", "PCV13 (2nd)", "RV (2nd)"] },
  { ageMonths: 6, vaccines: ["DTaP (3rd)", "Hib (3rd, depends on brand)", "PCV13 (3rd)", "RV (3rd, if needed)", "Hepatitis B (3rd)", "Influenza (yearly, starting at 6mo)"] },
  { ageMonths: 12, vaccines: ["MMR (1st)", "Varicella (1st)", "Hepatitis A (1st)", "Hib (booster)", "PCV13 (booster)"] },
  { ageMonths: 15, vaccines: ["DTaP (4th)"] },
  { ageMonths: 18, vaccines: ["Hepatitis A (2nd)"] },
];

function PediatricianSection({ childId, parentId, hasActiveFlags }: { childId: string; parentId: string; hasActiveFlags: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    visit_type: "well",
    provider_name: "",
    practice_name: "",
    notes: "",
    next_appointment_date: "",
  });

  const { data: visits } = useQuery({
    queryKey: ["pediatrician-visits", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pediatrician_visits")
        .select("*")
        .eq("child_id", childId)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertVisit = useMutation({
    mutationFn: async () => {
      const payload = {
        child_id: childId,
        parent_id: parentId,
        visit_date: form.visit_date,
        visit_type: form.visit_type,
        provider_name: form.provider_name.trim() || null,
        practice_name: form.practice_name.trim() || null,
        notes: form.notes.trim() || null,
        next_appointment_date: form.next_appointment_date || null,
      };
      if (editingId) {
        const { error } = await supabase.from("pediatrician_visits").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pediatrician_visits").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pediatrician-visits", childId] });
      setOpen(false);
      setEditingId(null);
      toast({ title: editingId ? "Visit updated" : "Visit logged" });
    },
  });

  const deleteVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pediatrician_visits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pediatrician-visits", childId] });
      toast({ title: "Visit removed" });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({
      visit_date: format(new Date(), "yyyy-MM-dd"),
      visit_type: "well",
      provider_name: "",
      practice_name: "",
      notes: "",
      next_appointment_date: "",
    });
    setOpen(true);
  };

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Stethoscope className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Pediatrician Visits</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {hasActiveFlags && (
          <Alert className="border-orange-300 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm text-orange-900">
              You have active milestone flags — consider generating a summary for this visit.
            </AlertDescription>
          </Alert>
        )}

        {visits && visits.length > 0 ? (
          <div className="space-y-2">
            {visits.map((v) => (
              <Card key={v.id} className="border-0 bg-muted/40">
                <CardContent className="p-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold">
                      {safeFormatDate(v.visit_date, "MMM d, yyyy")} • {VISIT_TYPES.find((t) => t.value === v.visit_type)?.label ?? v.visit_type}
                    </p>
                    {v.provider_name && <p className="text-xs text-muted-foreground">{v.provider_name}{v.practice_name ? ` • ${v.practice_name}` : ""}</p>}
                    {v.notes && <p className="text-xs text-foreground/80 mt-1">{v.notes}</p>}
                    {v.next_appointment_date && <p className="text-xs text-primary mt-1">Next: {safeFormatDate(v.next_appointment_date, "MMM d, yyyy")}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteVisit.mutate(v.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No pediatrician visits logged yet.</p>
        )}

        <Button variant="outline" className="w-full border-dashed gap-2 touch-target" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Visit
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">{editingId ? "Edit Visit" : "Log Pediatrician Visit"}</SheetTitle>
              <SheetDescription>Track wellness checks, sick visits, and follow-ups.</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Visit date</Label>
                <Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Visit type</Label>
                <Select value={form.visit_type} onValueChange={(v) => setForm({ ...form, visit_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Provider name</Label>
                <Input value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} placeholder="Dr. Smith" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Practice name</Label>
                <Input value={form.practice_name} onChange={(e) => setForm({ ...form, practice_name: e.target.value })} placeholder="Children's Medical Group" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Next appointment</Label>
                <Input type="date" value={form.next_appointment_date} onChange={(e) => setForm({ ...form, next_appointment_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Weight, height, observations..." />
              </div>
              <Button className="w-full h-12 touch-target" disabled={upsertVisit.isPending} onClick={() => upsertVisit.mutate()}>
                {upsertVisit.isPending ? "Saving..." : "Save Visit"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </CollapsibleContent>
    </Collapsible>
  );
}

function VaccinationsSection({ childId, parentId, ageMonths }: { childId: string; parentId: string; ageMonths: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vaccine_name: "",
    date_administered: format(new Date(), "yyyy-MM-dd"),
    lot_number: "",
    provider_name: "",
    next_due_date: "",
    declined: false,
  });

  const { data: vaccines } = useQuery({
    queryKey: ["vaccinations", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vaccinations")
        .select("*")
        .eq("child_id", childId)
        .order("date_administered", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const addVaccine = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vaccinations").insert({
        child_id: childId,
        parent_id: parentId,
        vaccine_name: form.vaccine_name.trim(),
        date_administered: form.declined ? null : (form.date_administered || null),
        lot_number: form.lot_number.trim() || null,
        provider_name: form.provider_name.trim() || null,
        next_due_date: form.next_due_date || null,
        declined: form.declined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaccinations", childId] });
      setOpen(false);
      toast({ title: form.declined ? "Marked as declined" : "Vaccine logged" });
    },
  });

  const deleteVaccine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccinations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vaccinations", childId] }),
  });

  const upcomingFromCDC = CDC_VACCINE_SCHEDULE.filter((s) => s.ageMonths <= ageMonths + 3 && s.ageMonths >= ageMonths - 3);

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Syringe className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Vaccinations</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        {upcomingFromCDC.length > 0 && (
          <Card className="border-0 bg-muted/40">
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CDC reference (around your child's age)</p>
              {upcomingFromCDC.map((s) => (
                <div key={s.ageMonths} className="text-xs">
                  <span className="font-semibold">{s.ageMonths === 0 ? "Birth" : `${s.ageMonths}mo`}:</span>{" "}
                  <span className="text-muted-foreground">{s.vaccines.join(", ")}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground italic pt-1">Always confirm the current schedule with your pediatrician.</p>
            </CardContent>
          </Card>
        )}

        {vaccines && vaccines.length > 0 ? (
          <div className="space-y-2">
            {vaccines.map((v) => (
              <Card key={v.id} className={`border-0 ${v.declined ? "bg-muted/30" : "bg-muted/40"}`}>
                <CardContent className="p-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold">
                      {v.vaccine_name}
                      {v.declined && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">declined</span>}
                    </p>
                    {v.date_administered && <p className="text-xs text-muted-foreground">Given {safeFormatDate(v.date_administered, "MMM d, yyyy")}{v.provider_name ? ` • ${v.provider_name}` : ""}</p>}
                    {v.lot_number && <p className="text-xs text-muted-foreground">Lot: {v.lot_number}</p>}
                    {v.next_due_date && <p className="text-xs text-primary">Next dose: {safeFormatDate(v.next_due_date, "MMM d, yyyy")}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteVaccine.mutate(v.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No vaccinations logged yet.</p>
        )}

        <Button
          variant="outline"
          className="w-full border-dashed gap-2 touch-target"
          onClick={() => {
            setForm({
              vaccine_name: "",
              date_administered: format(new Date(), "yyyy-MM-dd"),
              lot_number: "",
              provider_name: "",
              next_due_date: "",
              declined: false,
            });
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4" /> Add Vaccine
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">Log Vaccination</SheetTitle>
              <SheetDescription>Record a vaccine, or mark one as declined.</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Vaccine name</Label>
                <Input value={form.vaccine_name} onChange={(e) => setForm({ ...form, vaccine_name: e.target.value })} placeholder="e.g. DTaP (1st dose)" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-semibold">Declined</Label>
                  <p className="text-xs text-muted-foreground">We won't ask why.</p>
                </div>
                <Switch checked={form.declined} onCheckedChange={(checked) => setForm({ ...form, declined: checked })} />
              </div>
              {!form.declined && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Date administered</Label>
                    <Input type="date" value={form.date_administered} onChange={(e) => setForm({ ...form, date_administered: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Lot number</Label>
                    <Input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} placeholder="Optional" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Provider</Label>
                    <Input value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} placeholder="Optional" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Next dose due</Label>
                    <Input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
                  </div>
                </>
              )}
              <Button
                className="w-full h-12 touch-target"
                disabled={!form.vaccine_name.trim() || addVaccine.isPending}
                onClick={() => addVaccine.mutate()}
              >
                {addVaccine.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DentalSection({ childId, parentId, ageMonths }: { childId: string; parentId: string; ageMonths: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    visit_date: format(new Date(), "yyyy-MM-dd"),
    provider_name: "",
    notes: "",
  });

  const { data: visits } = useQuery({
    queryKey: ["dental-visits", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dental_visits")
        .select("*")
        .eq("child_id", childId)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addVisit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("dental_visits").insert({
        child_id: childId,
        parent_id: parentId,
        visit_date: form.visit_date,
        provider_name: form.provider_name.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dental-visits", childId] });
      setOpen(false);
      toast({ title: "Dental visit logged" });
    },
  });

  const deleteVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dental_visits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dental-visits", childId] }),
  });

  const showFirstDentalPrompt = ageMonths >= 12 && (visits?.length ?? 0) === 0;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Smile className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Dental Visits</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {showFirstDentalPrompt && (
          <Alert className="border-blue-300 bg-blue-50">
            <AlertDescription className="text-sm text-blue-900">
              The AAP recommends a first dental visit by age 1, or within 6 months of the first tooth.
            </AlertDescription>
          </Alert>
        )}

        {visits && visits.length > 0 ? (
          <div className="space-y-2">
            {visits.map((v) => (
              <Card key={v.id} className="border-0 bg-muted/40">
                <CardContent className="p-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold">{safeFormatDate(v.visit_date, "MMM d, yyyy")}</p>
                    {v.provider_name && <p className="text-xs text-muted-foreground">{v.provider_name}</p>}
                    {v.notes && <p className="text-xs text-foreground/80 mt-1">{v.notes}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteVisit.mutate(v.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No dental visits logged yet.</p>
        )}

        <Button
          variant="outline"
          className="w-full border-dashed gap-2 touch-target"
          onClick={() => {
            setForm({ visit_date: format(new Date(), "yyyy-MM-dd"), provider_name: "", notes: "" });
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4" /> Add Visit
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">Log Dental Visit</SheetTitle>
              <SheetDescription>Track checkups and dental work.</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Visit date</Label>
                <Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Provider</Label>
                <Input value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} placeholder="Dr. ..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button className="w-full h-12 touch-target" disabled={addVisit.isPending} onClick={() => addVisit.mutate()}>
                {addVisit.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MedicalTab({ childId, parentId, ageMonths }: Props) {
  const { activeChild } = useChildren();
  // Match the suppression used by MilestoneFlags + MilestonesPage banner so a
  // parent who just signed up with a backdated child doesn't see "you have
  // active milestone flags" under Pediatrician Visits before they've had a
  // chance to log anything.
  const inGracePeriod = activeChild ? isInRetroactiveGracePeriod(activeChild) : false;

  const { data: activeFlagCount } = useQuery({
    queryKey: ["active-flag-count", childId, inGracePeriod],
    queryFn: async () => {
      if (inGracePeriod) return 0;
      const { data: speech } = await supabase
        .from("speech")
        .select("id, age_months_concern_flag")
        .not("age_months_concern_flag", "is", null);
      const { data: childSpeech } = await supabase
        .from("child_speech")
        .select("milestone_id, status")
        .eq("child_id", childId)
        .eq("status", "achieved");
      const { data: dismissed } = await supabase
        .from("milestone_flags")
        .select("milestone_id")
        .eq("child_id", childId)
        .not("dismissed_at", "is", null);

      if (!speech) return 0;
      const achievedIds = new Set(childSpeech?.map((c) => c.milestone_id) ?? []);
      const dismissedIds = new Set(dismissed?.map((d) => d.milestone_id) ?? []);
      return speech.filter((m) =>
        m.age_months_concern_flag != null &&
        ageMonths >= m.age_months_concern_flag &&
        !achievedIds.has(m.id) &&
        !dismissedIds.has(m.id)
      ).length;
    },
  });

  return (
    <div className="space-y-6">
      <UpcomingVisitsSection childId={childId} parentId={parentId} />
      <PediatricianSection childId={childId} parentId={parentId} hasActiveFlags={(activeFlagCount ?? 0) > 0} />
      <VaccinationsSection childId={childId} parentId={parentId} ageMonths={ageMonths} />
      <DentalSection childId={childId} parentId={parentId} ageMonths={ageMonths} />
    </div>
  );
}
