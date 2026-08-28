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
import { Stethoscope, Syringe, Smile, Thermometer, Pill, Plus, ChevronDown, Check, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO, isValid } from "date-fns";
import { safeFormatDate } from "@/lib/safeFormat";
import { UpcomingVisitsSection } from "@/components/records/UpcomingVisitsSection";
import { useChildren, isInRetroactiveGracePeriod } from "@/hooks/useChildren";
import { assertCanWrite, useCurrentRoleQuery, VIEW_ONLY_MESSAGE } from "@/hooks/useCurrentRole";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { HIGH_TEMP_NOTE, isHighTemp } from "@/lib/temperature";

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

const COMMON_ILLNESSES = [
  "Cold",
  "Ear infection",
  "RSV",
  "Stomach bug",
  "Croup",
  "Hand-foot-and-mouth",
];

// illness_logs / medication_logs store `date`, not `timestamptz`. parseISO on a
// bare yyyy-MM-dd yields local midnight; `new Date(...)` would yield UTC
// midnight and render as the previous day west of Greenwich.
function formatDateOnly(value: string | null | undefined, fmt = "MMM d, yyyy") {
  if (!value) return "—";
  const d = parseISO(value);
  return isValid(d) ? format(d, fmt) : "—";
}

type IllnessRow = {
  id: string;
  illness_name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

type MedicationRow = {
  id: string;
  illness_log_id: string | null;
  medication_name: string;
  dose: string | null;
  frequency: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

// A PostgrestError carries raw Postgres text ("new row violates row-level
// security policy for table ..."), which is meaningless to a parent. 42501 is
// insufficient_privilege — in practice a view-only partner or one whose access
// was revoked mid-session.
function describeWriteError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code?: unknown }).code) : "";
  if (code === "42501") {
    return VIEW_ONLY_MESSAGE;
  }
  return err instanceof Error && err.message ? err.message : "Please try again.";
}

const emptyIllnessForm = () => ({
  illness_name: "",
  start_date: format(new Date(), "yyyy-MM-dd"),
  end_date: "",
  notes: "",
});

const emptyMedicationForm = () => ({
  medication_name: "",
  dose: "",
  frequency: "",
  start_date: format(new Date(), "yyyy-MM-dd"),
  end_date: "",
  notes: "",
});

function IllnessSection({ childId, parentId }: { childId: string; parentId: string }) {
  const queryClient = useQueryClient();
  const { role, isResolved: roleResolved } = useCurrentRoleQuery(childId);
  // Only owner / coparent / viewer ever reach this component — DashboardLayout
  // routes caregivers to CaregiverHome, which has no Records surface at all.
  //
  // This gate is a UX guardrail, not the security boundary. RLS is the boundary:
  // 20260820000000_child_pivot_log_rls.sql repointed these policies at child_id
  // via can_write_child(), which excludes viewers server-side, so a viewer's
  // INSERT is rejected by Postgres regardless of what the client sends. (Before
  // that migration this gate WAS load-bearing, because policies pivoted on the
  // client-supplied parent_id and its first disjunct was always true.)
  //
  // The mutationFn guards below are still worth keeping: an RLS-blocked UPDATE
  // returns zero rows with no error, so without them a mid-session role change
  // would report a false success. Until the role query settles it reports
  // "owner", so hold the controls back.
  const canWrite = roleResolved && role !== "viewer";

  const [illnessOpen, setIllnessOpen] = useState(false);
  const [editingIllnessId, setEditingIllnessId] = useState<string | null>(null);
  const [illnessForm, setIllnessForm] = useState(emptyIllnessForm);

  const [medOpen, setMedOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [medIllnessId, setMedIllnessId] = useState<string | null>(null);
  const [medForm, setMedForm] = useState(emptyMedicationForm);

  const { data: illnesses, isLoading: illnessesLoading } = useQuery({
    queryKey: ["illness-logs", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("illness_logs")
        .select("id, illness_name, start_date, end_date, notes")
        .eq("child_id", childId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as IllnessRow[];
    },
  });

  const { data: medications } = useQuery({
    queryKey: ["medication-logs", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medication_logs")
        .select("id, illness_log_id, medication_name, dose, frequency, start_date, end_date, notes")
        .eq("child_id", childId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as MedicationRow[];
    },
  });

  const upsertIllness = useMutation({
    mutationFn: async () => {
      assertCanWrite(roleResolved, role);
      const payload = {
        illness_name: illnessForm.illness_name.trim(),
        start_date: illnessForm.start_date,
        end_date: illnessForm.end_date || null,
        notes: illnessForm.notes.trim() || null,
      };
      if (editingIllnessId) {
        const { error } = await supabase.from("illness_logs").update(payload).eq("id", editingIllnessId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("illness_logs")
          .insert({ ...payload, child_id: childId, parent_id: parentId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      setIllnessOpen(false);
      setEditingIllnessId(null);
      toast({ title: editingIllnessId ? "Illness updated" : "Illness logged" });
    },
    onError: (err) => {
      toast({ title: "Couldn't save illness", description: describeWriteError(err), variant: "destructive" });
    },
  });

  const resolveIllness = useMutation({
    mutationFn: async (illness: IllnessRow) => {
      assertCanWrite(roleResolved, role);
      const today = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase
        .from("illness_logs")
        .update({ end_date: today < illness.start_date ? illness.start_date : today })
        .eq("id", illness.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      toast({ title: "Marked resolved", description: "Glad they're feeling better." });
    },
    onError: (err) => {
      toast({ title: "Couldn't mark resolved", description: describeWriteError(err), variant: "destructive" });
    },
  });

  const deleteIllness = useMutation({
    mutationFn: async (id: string) => {
      assertCanWrite(roleResolved, role);
      const { error } = await supabase.from("illness_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_result, id) => {
      invalidateAfterLogWrite(queryClient);
      const moved = (medications ?? []).filter((m) => m.illness_log_id === id).length;
      toast({
        title: "Illness removed",
        description: moved > 0
          ? `${moved} medication${moved === 1 ? "" : "s"} moved to Other medications — nothing was deleted.`
          : undefined,
      });
    },
    onError: (err) => {
      toast({ title: "Couldn't remove illness", description: describeWriteError(err), variant: "destructive" });
    },
  });

  const upsertMedication = useMutation({
    mutationFn: async () => {
      assertCanWrite(roleResolved, role);
      const payload = {
        illness_log_id: medIllnessId,
        medication_name: medForm.medication_name.trim(),
        dose: medForm.dose.trim() || null,
        frequency: medForm.frequency.trim() || null,
        start_date: medForm.start_date,
        end_date: medForm.end_date || null,
        notes: medForm.notes.trim() || null,
      };
      if (editingMedId) {
        const { error } = await supabase.from("medication_logs").update(payload).eq("id", editingMedId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("medication_logs")
          .insert({ ...payload, child_id: childId, parent_id: parentId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      setMedOpen(false);
      setEditingMedId(null);
      toast({ title: editingMedId ? "Medication updated" : "Medication logged" });
    },
    onError: (err) => {
      toast({ title: "Couldn't save medication", description: describeWriteError(err), variant: "destructive" });
    },
  });

  const deleteMedication = useMutation({
    mutationFn: async (id: string) => {
      assertCanWrite(roleResolved, role);
      const { error } = await supabase.from("medication_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      toast({ title: "Medication removed" });
    },
    onError: (err) => {
      toast({ title: "Couldn't remove medication", description: describeWriteError(err), variant: "destructive" });
    },
  });

  const openAddIllness = () => {
    setEditingIllnessId(null);
    setIllnessForm(emptyIllnessForm());
    setIllnessOpen(true);
  };

  const openEditIllness = (i: IllnessRow) => {
    setEditingIllnessId(i.id);
    setIllnessForm({
      illness_name: i.illness_name,
      start_date: i.start_date,
      end_date: i.end_date ?? "",
      notes: i.notes ?? "",
    });
    setIllnessOpen(true);
  };

  const openAddMedication = (illnessLogId: string | null) => {
    setEditingMedId(null);
    setMedIllnessId(illnessLogId);
    setMedForm(emptyMedicationForm());
    setMedOpen(true);
  };

  const openEditMedication = (m: MedicationRow) => {
    setEditingMedId(m.id);
    setMedIllnessId(m.illness_log_id);
    setMedForm({
      medication_name: m.medication_name,
      dose: m.dose ?? "",
      frequency: m.frequency ?? "",
      start_date: m.start_date,
      end_date: m.end_date ?? "",
      notes: m.notes ?? "",
    });
    setMedOpen(true);
  };

  // Active (end_date IS NULL) first — same predicate the AI context blob and the
  // get_illnesses chat tool use — then most recent start_date.
  const sortedIllnesses = [...(illnesses ?? [])].sort((a, b) => {
    const activeDelta = Number(!!a.end_date) - Number(!!b.end_date);
    if (activeDelta !== 0) return activeDelta;
    return b.start_date.localeCompare(a.start_date);
  });
  const standaloneMeds = (medications ?? []).filter((m) => !m.illness_log_id);

  const illnessDatesValid = !illnessForm.end_date || illnessForm.end_date >= illnessForm.start_date;
  const medDatesValid = !medForm.end_date || medForm.end_date >= medForm.start_date;

  const renderMedication = (m: MedicationRow) => {
    const details = (
      <>
        <p className="text-sm font-semibold">
          {m.medication_name}
          {m.dose ? <span className="font-normal text-muted-foreground"> · {m.dose}</span> : null}
          {m.frequency ? <span className="font-normal text-muted-foreground"> · {m.frequency}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateOnly(m.start_date, "MMM d")}
          {m.end_date ? ` – ${formatDateOnly(m.end_date, "MMM d")}` : " · ongoing"}
        </p>
        {m.notes && <p className="text-xs text-foreground/80 mt-1">{m.notes}</p>}
      </>
    );
    return (
      <div key={m.id} className="flex items-start gap-2 rounded-lg bg-background/70 p-2">
        {canWrite ? (
          <button className="flex-1 min-w-0 text-left touch-target" onClick={() => openEditMedication(m)}>
            {details}
          </button>
        ) : (
          <div className="flex-1 min-w-0">{details}</div>
        )}
        {canWrite && (
          <Button
            variant="ghost"
            size="icon"
            className="touch-target shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${m.medication_name}`}
            onClick={() => deleteMedication.mutate(m.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Pill className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Illness &amp; Medications</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {illnessesLoading ? (
          <p className="text-sm text-muted-foreground">Loading sick days…</p>
        ) : sortedIllnesses.length > 0 ? (
          <div className="space-y-2">
            {sortedIllnesses.map((i) => {
              const active = !i.end_date;
              const meds = (medications ?? []).filter((m) => m.illness_log_id === i.id);
              return (
                <Card key={i.id} className={active ? "border border-warning/40 bg-warning/5" : "border-0 bg-muted/40"}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                          {i.illness_name}
                          {active && (
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-warning text-warning-foreground">
                              Active
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Started {formatDateOnly(i.start_date)}
                          {i.end_date ? ` · resolved ${formatDateOnly(i.end_date)}` : ""}
                        </p>
                        {i.notes && <p className="text-xs text-foreground/80 mt-1">{i.notes}</p>}
                      </div>
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="touch-target shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${i.illness_name}`}
                          onClick={() => deleteIllness.mutate(i.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {meds.length > 0 && <div className="space-y-1.5">{meds.map(renderMedication)}</div>}

                    {(canWrite || active) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canWrite && (
                          <>
                            <Button variant="outline" size="sm" className="gap-1 min-h-[48px]" onClick={() => openAddMedication(i.id)}>
                              <Plus className="w-4 h-4" /> Medication
                            </Button>
                            <Button variant="ghost" size="sm" className="min-h-[48px]" onClick={() => openEditIllness(i)}>
                              Edit
                            </Button>
                            {active && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 min-h-[48px] text-primary"
                                disabled={resolveIllness.isPending}
                                onClick={() => resolveIllness.mutate(i)}
                              >
                                <Check className="w-4 h-4" /> Mark resolved
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {canWrite
              ? "Log a sick day to keep symptoms and doses in one place."
              : "Sick days and medication doses show up here once they're logged."}
          </p>
        )}

        {standaloneMeds.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other medications</p>
            {standaloneMeds.map(renderMedication)}
          </div>
        )}

        {canWrite && (
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="w-full border-dashed gap-2 touch-target" onClick={openAddIllness}>
              <Plus className="w-4 h-4" /> Add Illness
            </Button>
            <Button variant="outline" className="w-full border-dashed gap-2 touch-target" onClick={() => openAddMedication(null)}>
              <Plus className="w-4 h-4" /> Add Medication
            </Button>
          </div>
        )}

        <Sheet open={illnessOpen} onOpenChange={setIllnessOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">{editingIllnessId ? "Edit Illness" : "Log an Illness"}</SheetTitle>
              <SheetDescription>Track what they came down with, and when it cleared.</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">What is it?</Label>
                <Input
                  list="common-illnesses"
                  value={illnessForm.illness_name}
                  onChange={(e) => setIllnessForm({ ...illnessForm, illness_name: e.target.value })}
                  placeholder="e.g. Ear infection"
                />
                <datalist id="common-illnesses">
                  {COMMON_ILLNESSES.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Started</Label>
                <Input type="date" value={illnessForm.start_date} onChange={(e) => setIllnessForm({ ...illnessForm, start_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Resolved</Label>
                <Input type="date" value={illnessForm.end_date} onChange={(e) => setIllnessForm({ ...illnessForm, end_date: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave empty while they're still sick.</p>
                {!illnessDatesValid && (
                  <p className="text-xs font-semibold text-destructive">The resolved date is before the start date — pick a later day.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea value={illnessForm.notes} onChange={(e) => setIllnessForm({ ...illnessForm, notes: e.target.value })} placeholder="Symptoms, what the doctor said..." />
              </div>
              <Button
                className="w-full h-12 touch-target"
                disabled={!illnessForm.illness_name.trim() || !illnessDatesValid || upsertIllness.isPending}
                onClick={() => upsertIllness.mutate()}
              >
                {upsertIllness.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={medOpen} onOpenChange={setMedOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">{editingMedId ? "Edit Medication" : "Log a Medication"}</SheetTitle>
              <SheetDescription>
                {medIllnessId
                  ? "This dose will be filed under the illness you picked."
                  : "Not tied to an illness — good for vitamins and daily meds."}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Medication</Label>
                <Input value={medForm.medication_name} onChange={(e) => setMedForm({ ...medForm, medication_name: e.target.value })} placeholder="e.g. Amoxicillin" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-semibold">Dose</Label>
                  <Input value={medForm.dose} onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })} placeholder="2.5 mL" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-semibold">Frequency</Label>
                  <Input value={medForm.frequency} onChange={(e) => setMedForm({ ...medForm, frequency: e.target.value })} placeholder="Twice a day" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Started</Label>
                <Input type="date" value={medForm.start_date} onChange={(e) => setMedForm({ ...medForm, start_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Finished</Label>
                <Input type="date" value={medForm.end_date} onChange={(e) => setMedForm({ ...medForm, end_date: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave empty while they're still taking it.</p>
                {!medDatesValid && (
                  <p className="text-xs font-semibold text-destructive">The finish date is before the start date — pick a later day.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea value={medForm.notes} onChange={(e) => setMedForm({ ...medForm, notes: e.target.value })} placeholder="Prescribing doctor, side effects..." />
              </div>
              <Button
                className="w-full h-12 touch-target"
                disabled={!medForm.medication_name.trim() || !medDatesValid || upsertMedication.isPending}
                onClick={() => upsertMedication.mutate()}
              >
                {upsertMedication.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </CollapsibleContent>
    </Collapsible>
  );
}

const TEMP_METHODS = [
  { value: "oral", label: "Oral" },
  { value: "rectal", label: "Rectal" },
  { value: "axillary", label: "Axillary (underarm)" },
  { value: "forehead", label: "Forehead" },
  { value: "ear", label: "Ear" },
];

function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

function TemperatureSection({ childId, parentId }: { childId: string; parentId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    temp_value: "",
    unit: "F",
    method: "none",
    taken_at: isoToLocalInput(new Date().toISOString()),
    notes: "",
  });

  const { data: readings } = useQuery({
    queryKey: ["temperature-logs", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("temperature_logs")
        .select("*")
        .eq("child_id", childId)
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertReading = useMutation({
    mutationFn: async () => {
      const payload = {
        temp_value: Number(form.temp_value),
        unit: form.unit,
        method: form.method === "none" ? null : form.method,
        taken_at: localInputToIso(form.taken_at),
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("temperature_logs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("temperature_logs")
          .insert({ ...payload, child_id: childId, parent_id: parentId, source: "manual" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      setOpen(false);
      setEditingId(null);
      toast({ title: editingId ? "Reading updated" : "Temperature logged" });
    },
    onError: (err) => {
      toast({ title: "Couldn't save reading", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    },
  });

  const deleteReading = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("temperature_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      toast({ title: "Reading removed" });
    },
    onError: (err) => {
      toast({ title: "Couldn't remove reading", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm({
      temp_value: "",
      unit: "F",
      method: "none",
      taken_at: isoToLocalInput(new Date().toISOString()),
      notes: "",
    });
    setOpen(true);
  };

  const openEdit = (r: { id: string; temp_value: number; unit: string; method: string | null; taken_at: string; notes: string | null }) => {
    setEditingId(r.id);
    setForm({
      temp_value: String(r.temp_value),
      unit: r.unit,
      method: r.method ?? "none",
      taken_at: isoToLocalInput(r.taken_at),
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const enteredValue = Number(form.temp_value);
  const valueValid = form.temp_value.trim() !== "" && Number.isFinite(enteredValue);
  const formIsHigh = valueValid && isHighTemp(enteredValue, form.unit);

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
        <Thermometer className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg flex-1 text-left">Temperature</h3>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {readings && readings.length > 0 ? (
          <div className="space-y-2">
            {readings.map((r) => {
              const high = isHighTemp(r.temp_value, r.unit);
              return (
                <Card key={r.id} className="border-0 bg-muted/40">
                  <CardContent className="p-3 flex items-start gap-2">
                    <button className="flex-1 min-w-0 space-y-0.5 text-left touch-target" onClick={() => openEdit(r)}>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        {r.temp_value}°{r.unit}
                        {high && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border border-orange-300 bg-orange-50 text-orange-900">
                            <AlertTriangle className="w-3 h-3" /> Above typical
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{safeFormatDate(r.taken_at, "MMM d, yyyy · h:mm a")}</p>
                      {r.method && <p className="text-xs text-muted-foreground">{TEMP_METHODS.find((m) => m.value === r.method)?.label ?? r.method}</p>}
                      {r.notes && <p className="text-xs text-foreground/80 mt-1">{r.notes}</p>}
                    </button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteReading.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No temperature readings logged yet.</p>
        )}

        <Button variant="outline" className="w-full border-dashed gap-2 touch-target" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Reading
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">{editingId ? "Edit Reading" : "Log Temperature"}</SheetTitle>
              <SheetDescription>Record a temperature reading with the time it was taken.</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 mt-4">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-semibold">Temperature</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={form.temp_value}
                    onChange={(e) => setForm({ ...form, temp_value: e.target.value })}
                    placeholder="98.6"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs font-semibold">Unit</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">°F</SelectItem>
                      <SelectItem value="C">°C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formIsHigh && (
                <Alert className="border-orange-300 bg-orange-50">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-sm text-orange-900">{HIGH_TEMP_NOTE}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {TEMP_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Taken at</Label>
                <Input type="datetime-local" value={form.taken_at} onChange={(e) => setForm({ ...form, taken_at: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="How your baby is doing, any symptoms..." />
              </div>
              <Button className="w-full h-12 touch-target" disabled={!valueValid || upsertReading.isPending} onClick={() => upsertReading.mutate()}>
                {upsertReading.isPending ? "Saving..." : "Save"}
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
      <IllnessSection childId={childId} parentId={parentId} />
      <TemperatureSection childId={childId} parentId={parentId} />
    </div>
  );
}
