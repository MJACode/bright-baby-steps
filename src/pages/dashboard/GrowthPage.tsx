import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChildren } from "@/hooks/useChildren";
import { AddChildDialog } from "@/components/AddChildDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine,
} from "recharts";
import { Scale, Plus, Stethoscope, TrendingUp, TrendingDown, Minus, Pencil, Trash2, Ruler, CircleDashed } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  cmToIn,
  inToCm,
  correctedAgeMonths,
  weightPercentile,
  lengthPercentile,
  headPercentile,
  formatPercentile,
} from "@/lib/growthPercentiles";

// ── weight unit helpers ───────────────────────────────────────────────────────

function lbsOzToOz(lbs: number, oz: number): number {
  return lbs * 16 + oz;
}

function ozToLbsOz(totalOz: number): { lbs: number; oz: number } {
  return { lbs: Math.floor(totalOz / 16), oz: Math.round(totalOz % 16) };
}

function displayWeight(totalOz: number | null | undefined): string {
  if (totalOz == null) return "—";
  const { lbs, oz } = ozToLbsOz(totalOz);
  return `${lbs} lbs ${oz} oz`;
}

function displayInches(cm: number | null | undefined): string {
  if (cm == null) return "—";
  return `${cmToIn(cm).toFixed(1)} in`;
}

function pctChange(current: number, reference: number): number {
  return ((current - reference) / reference) * 100;
}

// ── Weight input component ─────────────────────────────────────────────────────

function WeightInput({
  label,
  lbs,
  oz,
  onLbsChange,
  onOzChange,
}: {
  label: string;
  lbs: string;
  oz: string;
  onLbsChange: (v: string) => void;
  onOzChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <Input
            type="number"
            min="0"
            max="30"
            placeholder="0"
            value={lbs}
            onChange={(e) => onLbsChange(e.target.value)}
            className="text-center"
          />
          <p className="text-center text-xs text-muted-foreground mt-1">lbs</p>
        </div>
        <span className="text-muted-foreground font-medium pb-5">+</span>
        <div className="flex-1">
          <Input
            type="number"
            min="0"
            max="15"
            placeholder="0"
            value={oz}
            onChange={(e) => onOzChange(e.target.value)}
            className="text-center"
          />
          <p className="text-center text-xs text-muted-foreground mt-1">oz</p>
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  sub,
  delta,
  icon,
}: {
  title: string;
  value: string;
  sub?: string;
  delta?: number | null;
  icon: React.ReactNode;
}) {
  const DeltaIcon =
    delta == null ? null : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor =
    delta == null ? "" : delta > 0 ? "text-green-600" : delta < 0 ? "text-red-500" : "text-muted-foreground";

  return (
    <Card className="border-0 bg-card/60 flex-1 min-w-0">
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        </div>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        {(sub || delta != null) && (
          <div className={cn("flex items-center gap-1 text-xs", deltaColor)}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" />}
            <span>{sub}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GrowthPage() {
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();

  const [logOpen, setLogOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pctlMetric, setPctlMetric] = useState<"weight" | "length" | "head">("weight");

  // Log measurement form state
  const [logDate, setLogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [logLbs, setLogLbs] = useState("");
  const [logOz, setLogOz] = useState("");
  const [logLengthIn, setLogLengthIn] = useState("");
  const [logHeadIn, setLogHeadIn] = useState("");
  const [logIsPeds, setLogIsPeds] = useState(false);
  const [logNotes, setLogNotes] = useState("");

  const resetLogForm = () => {
    setEditingId(null);
    setLogLbs(""); setLogOz(""); setLogLengthIn(""); setLogHeadIn("");
    setLogNotes(""); setLogIsPeds(false);
    setLogDate(format(new Date(), "yyyy-MM-dd"));
  };

  // Setup baseline form state
  const [birthLbs, setBirthLbs] = useState("");
  const [birthOz, setBirthOz] = useState("");
  const [dischargeLbs, setDischargeLbs] = useState("");
  const [dischargeOz, setDischargeOz] = useState("");

  const childId = activeChild?.id;

  // Fetch weight logs
  const { data: logs = [] } = useQuery({
    queryKey: ["weight-logs", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_logs")
        .select("*")
        .eq("child_id", childId!)
        .order("logged_at", { ascending: true });
      if (error) throw error;
      return data as {
        id: string;
        weight_oz: number | null;
        length_cm: number | null;
        head_circumference_cm: number | null;
        logged_at: string;
        is_pediatrician_visit: boolean;
        notes: string | null;
      }[];
    },
    enabled: !!childId,
  });

  // Fetch child (for birth/discharge weights)
  const { data: child } = useQuery({
    queryKey: ["child-weights", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("birth_weight_oz, discharge_weight_oz, name")
        .eq("id", childId!)
        .single();
      if (error) throw error;
      return data as { birth_weight_oz: number | null; discharge_weight_oz: number | null; name: string };
    },
    enabled: !!childId,
  });

  // Insert measurement log
  const logWeight = useMutation({
    mutationFn: async () => {
      const lbs = parseFloat(logLbs) || 0;
      const oz = parseFloat(logOz) || 0;
      const totalOz = lbsOzToOz(lbs, oz);
      const lengthIn = parseFloat(logLengthIn);
      const headIn = parseFloat(logHeadIn);
      const lengthCm = Number.isFinite(lengthIn) && lengthIn > 0 ? inToCm(lengthIn) : null;
      const headCm = Number.isFinite(headIn) && headIn > 0 ? inToCm(headIn) : null;
      const weightOz = totalOz > 0 ? totalOz : null;
      if (weightOz == null && lengthCm == null && headCm == null) {
        throw new Error("Enter at least one measurement.");
      }
      const payload = {
        weight_oz: weightOz,
        length_cm: lengthCm,
        head_circumference_cm: headCm,
        logged_at: logDate,
        is_pediatrician_visit: logIsPeds,
        notes: logNotes.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("weight_logs")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("weight_logs")
          .insert({ child_id: childId!, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight-logs", childId] });
      toast({ title: editingId ? "Measurement updated" : "Measurement logged" });
      setLogOpen(false);
      resetLogForm();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete weight log
  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("weight_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight-logs", childId] });
      toast({ title: "Entry removed" });
      setDeleteId(null);
    },
  });

  // Save birth / discharge weights
  const saveBaseline = useMutation({
    mutationFn: async () => {
      const bLbs = parseFloat(birthLbs) || 0;
      const bOz = parseFloat(birthOz) || 0;
      const dLbs = parseFloat(dischargeLbs) || 0;
      const dOz = parseFloat(dischargeOz) || 0;
      const updates: Record<string, number | null> = {};
      if (bLbs + bOz > 0) updates.birth_weight_oz = lbsOzToOz(bLbs, bOz);
      if (dLbs + dOz > 0) updates.discharge_weight_oz = lbsOzToOz(dLbs, dOz);
      if (Object.keys(updates).length === 0) throw new Error("Enter at least one weight.");
      const { error } = await supabase.from("children").update(updates).eq("id", childId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-weights", childId] });
      queryClient.invalidateQueries({ queryKey: ["children"] });
      toast({ title: "Baseline weights saved" });
      setSetupOpen(false);
      setBirthLbs(""); setBirthOz(""); setDischargeLbs(""); setDischargeOz("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Derived stats ───────────────────────────────────────────────────────────

  // Most recent log per metric (entries may include any subset of metrics).
  const reversed = [...logs].reverse();
  const latestWeightLog = reversed.find((l) => l.weight_oz != null) ?? null;
  const latestLengthLog = reversed.find((l) => l.length_cm != null) ?? null;
  const latestHeadLog = reversed.find((l) => l.head_circumference_cm != null) ?? null;

  const currentOz = latestWeightLog?.weight_oz ?? null;
  const currentLengthCm = latestLengthLog?.length_cm ?? null;
  const currentHeadCm = latestHeadLog?.head_circumference_cm ?? null;
  const birthOzVal = child?.birth_weight_oz ?? null;
  const dischargeOzVal = child?.discharge_weight_oz ?? null;

  const vsbirthPct = currentOz != null && birthOzVal ? pctChange(currentOz, birthOzVal) : null;
  const goalReached = vsbirthPct != null && vsbirthPct >= 0;

  // Last pediatrician visit weight (most recent is_pediatrician_visit = true that has a weight)
  const lastPedsLog = reversed.find((l) => l.is_pediatrician_visit && l.weight_oz != null);
  const sinceLastPeds =
    currentOz != null && lastPedsLog && lastPedsLog.id !== latestWeightLog?.id
      ? currentOz - (lastPedsLog.weight_oz ?? 0)
      : null;

  // ── Percentiles (WHO, 0–24 months) ──────────────────────────────────────────
  // Computed against corrected age when child is premature.
  function pctlAt(date: string | undefined, fn: (m: number) => number | null): number | null {
    if (!activeChild || !date) return null;
    const m = correctedAgeMonths(
      activeChild.date_of_birth,
      activeChild.due_date ?? null,
      activeChild.is_premature ?? null,
      date,
    );
    return fn(m);
  }
  const weightPctl = currentOz != null
    ? pctlAt(latestWeightLog?.logged_at, (m) => weightPercentile(currentOz, activeChild?.gender, m))
    : null;
  const lengthPctl = currentLengthCm != null
    ? pctlAt(latestLengthLog?.logged_at, (m) => lengthPercentile(currentLengthCm, activeChild?.gender, m))
    : null;
  const headPctl = currentHeadCm != null
    ? pctlAt(latestHeadLog?.logged_at, (m) => headPercentile(currentHeadCm, activeChild?.gender, m))
    : null;

  // Chart data — weight only (length/HC trend charts are a follow-up).
  const chartData = logs
    .filter((l) => l.weight_oz != null)
    .map((l) => ({
      date: format(parseISO(l.logged_at), "M/d"),
      oz: l.logged_at,
      weight: (l.weight_oz ?? 0) / 16,
      label: displayWeight(l.weight_oz),
      isPeds: l.is_pediatrician_visit,
    }));

  const birthWeightLine = birthOzVal ? birthOzVal / 16 : undefined;

  // Percentile-over-time series for the selected metric. Only entries with a
  // computable WHO percentile (sex set, age 0–24 months) make it in.
  const canComputePercentiles =
    activeChild?.gender === "male" || activeChild?.gender === "female";
  const pctlMetricLabel =
    pctlMetric === "weight" ? "Weight" : pctlMetric === "length" ? "Length" : "Head";
  const percentileSeries = !activeChild
    ? []
    : logs.flatMap((l) => {
        const value =
          pctlMetric === "weight"
            ? l.weight_oz
            : pctlMetric === "length"
            ? l.length_cm
            : l.head_circumference_cm;
        if (value == null) return [];
        const ageM = correctedAgeMonths(
          activeChild.date_of_birth,
          activeChild.due_date ?? null,
          activeChild.is_premature ?? null,
          l.logged_at,
        );
        const fn =
          pctlMetric === "weight"
            ? weightPercentile
            : pctlMetric === "length"
            ? lengthPercentile
            : headPercentile;
        const pctl = fn(value, activeChild.gender, ageM);
        if (pctl == null) return [];
        return [{ date: format(parseISO(l.logged_at), "M/d"), pctl }];
      });

  const openEdit = (log: typeof logs[number]) => {
    setEditingId(log.id);
    if (log.weight_oz != null) {
      const { lbs, oz } = ozToLbsOz(log.weight_oz);
      setLogLbs(String(lbs));
      setLogOz(String(oz));
    } else {
      setLogLbs("");
      setLogOz("");
    }
    setLogLengthIn(log.length_cm != null ? cmToIn(log.length_cm).toFixed(1) : "");
    setLogHeadIn(log.head_circumference_cm != null ? cmToIn(log.head_circumference_cm).toFixed(1) : "");
    setLogDate(log.logged_at);
    setLogIsPeds(log.is_pediatrician_visit);
    setLogNotes(log.notes ?? "");
    setLogOpen(true);
  };

  const openSetup = () => {
    if (child?.birth_weight_oz) {
      const { lbs, oz } = ozToLbsOz(child.birth_weight_oz);
      setBirthLbs(String(lbs)); setBirthOz(String(oz));
    }
    if (child?.discharge_weight_oz) {
      const { lbs, oz } = ozToLbsOz(child.discharge_weight_oz);
      setDischargeLbs(String(lbs)); setDischargeOz(String(oz));
    }
    setSetupOpen(true);
  };

  if (!activeChild) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <Scale className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Add a child to start tracking growth</p>
        <AddChildDialog />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" /> Growth
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeChild.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openSetup}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Baseline
          </Button>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Log measurement
          </Button>
        </div>
      </div>

      {/* Setup prompt */}
      {!child?.birth_weight_oz && (
        <Card className="border-0 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Scale className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Set birth &amp; discharge weights</p>
              <p className="text-xs text-muted-foreground">
                Add baseline weights to track progress back to birth weight
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openSetup}>
              Set up
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Primary stat cards — current weight / length / head, each with percentile */}
      <div className="flex gap-3">
        <StatCard
          title="Weight"
          value={displayWeight(currentOz)}
          sub={
            weightPctl != null
              ? `${formatPercentile(weightPctl)} percentile`
              : latestWeightLog
              ? format(parseISO(latestWeightLog.logged_at), "MMM d")
              : undefined
          }
          icon={<Scale className="w-3.5 h-3.5" />}
        />
        <StatCard
          title="Length"
          value={displayInches(currentLengthCm)}
          sub={
            lengthPctl != null
              ? `${formatPercentile(lengthPctl)} percentile`
              : latestLengthLog
              ? format(parseISO(latestLengthLog.logged_at), "MMM d")
              : "Not logged"
          }
          icon={<Ruler className="w-3.5 h-3.5" />}
        />
        <StatCard
          title="Head"
          value={displayInches(currentHeadCm)}
          sub={
            headPctl != null
              ? `${formatPercentile(headPctl)} percentile`
              : latestHeadLog
              ? format(parseISO(latestHeadLog.logged_at), "MMM d")
              : "Not logged"
          }
          icon={<CircleDashed className="w-3.5 h-3.5" />}
        />
      </div>

      {/* Percentile context — only shown when measurements exist but no percentile can be computed for any of them. */}
      {(currentOz != null || currentLengthCm != null || currentHeadCm != null) &&
        weightPctl == null && lengthPctl == null && headPctl == null && (
          <p className="text-xs text-muted-foreground -mt-2">
            {!activeChild?.gender || activeChild.gender === "other"
              ? "Set your child's sex on their profile to see WHO percentiles."
              : "Percentiles are shown for ages 0–24 months."}
          </p>
        )}

      {/* Secondary row — birth-weight recovery & peds-visit delta */}
      {(birthOzVal || lastPedsLog) && (
        <div className="flex gap-3">
          {birthOzVal && (
            <StatCard
              title="vs birth"
              value={
                vsbirthPct != null
                  ? `${vsbirthPct >= 0 ? "+" : ""}${vsbirthPct.toFixed(1)}%`
                  : "—"
              }
              sub={
                vsbirthPct != null
                  ? goalReached
                    ? "Back to birth weight"
                    : `${displayWeight(birthOzVal)} goal`
                  : displayWeight(birthOzVal)
              }
              delta={vsbirthPct}
              icon={<TrendingUp className="w-3.5 h-3.5" />}
            />
          )}
          {lastPedsLog && (
            <StatCard
              title="Since last visit"
              value={
                sinceLastPeds != null
                  ? `${sinceLastPeds >= 0 ? "+" : ""}${displayWeight(Math.abs(sinceLastPeds))}`
                  : "—"
              }
              sub={format(parseISO(lastPedsLog.logged_at), "MMM d")}
              delta={sinceLastPeds}
              icon={<Stethoscope className="w-3.5 h-3.5" />}
            />
          )}
        </div>
      )}

      {/* Goal banner */}
      {birthOzVal && currentOz && !goalReached && (
        <Card className="border-0 bg-blue-50 dark:bg-blue-950/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Goal: reach birth weight
              </p>
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {displayWeight(birthOzVal - currentOz)} to go
              </span>
            </div>
            <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, (currentOz / birthOzVal) * 100)
                  ).toFixed(1)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Discharge: {displayWeight(dischargeOzVal ?? currentOz)}
              </span>
              <span>Birth: {displayWeight(birthOzVal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {goalReached && birthOzVal && (
        <Card className="border-0 bg-green-50 dark:bg-green-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Back to birth weight — great job!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <Card className="border-0 bg-card/60">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Weight over time
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(1)}`}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "none",
                    background: "hsl(var(--card))",
                    boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                    fontSize: 12,
                  }}
                  formatter={(v: number, _: string, props) => [
                    props.payload?.label ?? displayWeight(v * 16),
                    props.payload?.isPeds ? "Peds visit" : "Weight",
                  ]}
                />
                {birthWeightLine && (
                  <ReferenceLine
                    y={birthWeightLine}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="4 3"
                    label={{
                      value: "Birth",
                      position: "right",
                      fontSize: 10,
                      fill: "hsl(var(--primary))",
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    return payload.isPeds ? (
                      <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />
                    ) : (
                      <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Larger dots = pediatrician visits · dashed line = birth weight
            </p>
          </CardContent>
        </Card>
      )}

      {/* Percentile over time — "is she staying on her curve" */}
      {canComputePercentiles && logs.length > 0 && (
        <Card className="border-0 bg-card/60">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Percentile over time
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <div className="flex gap-1 px-2 pb-1" role="group" aria-label="Percentile metric">
              {(["weight", "length", "head"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPctlMetric(m)}
                  aria-pressed={pctlMetric === m}
                  className={cn(
                    "flex-1 min-h-[48px] rounded-lg text-sm font-semibold transition-colors",
                    pctlMetric === m
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "weight" ? "Weight" : m === "length" ? "Length" : "Head"}
                </button>
              ))}
            </div>
            {percentileSeries.length < 2 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">
                Add another measurement to see the trend.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={percentileSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "none",
                      background: "hsl(var(--card))",
                      boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${formatPercentile(v)} percentile`, pctlMetricLabel]}
                  />
                  <ReferenceLine
                    y={50}
                    stroke="hsl(var(--muted-foreground) / 0.3)"
                    strokeDasharray="4 3"
                    label={{
                      value: "50th",
                      position: "right",
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pctl"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground text-center mt-1 px-4">
              Staying near the same line matters more than the number itself.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Baseline summary */}
      {(child?.birth_weight_oz || child?.discharge_weight_oz) && (
        <div className="flex gap-3 text-sm">
          {child.birth_weight_oz && (
            <div className="flex-1 bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Birth weight</p>
              <p className="font-semibold">{displayWeight(child.birth_weight_oz)}</p>
            </div>
          )}
          {child.discharge_weight_oz && (
            <div className="flex-1 bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Discharge weight</p>
              <p className="font-semibold">{displayWeight(child.discharge_weight_oz)}</p>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <Card className="border-0 bg-card/60">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            History
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No measurements logged yet
            </p>
          ) : (
            [...logs].reverse().map((log) => {
              const ageM = activeChild
                ? correctedAgeMonths(
                    activeChild.date_of_birth,
                    activeChild.due_date ?? null,
                    activeChild.is_premature ?? null,
                    log.logged_at,
                  )
                : null;
              const parts: { label: string; pctl: number | null }[] = [];
              if (log.weight_oz != null) {
                parts.push({
                  label: displayWeight(log.weight_oz),
                  pctl: ageM != null ? weightPercentile(log.weight_oz, activeChild?.gender, ageM) : null,
                });
              }
              if (log.length_cm != null) {
                parts.push({
                  label: displayInches(log.length_cm),
                  pctl: ageM != null ? lengthPercentile(log.length_cm, activeChild?.gender, ageM) : null,
                });
              }
              if (log.head_circumference_cm != null) {
                parts.push({
                  label: `${displayInches(log.head_circumference_cm)} head`,
                  pctl: ageM != null ? headPercentile(log.head_circumference_cm, activeChild?.gender, ageM) : null,
                });
              }
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {parts.map((p, i) => (
                        <span key={i} className="font-semibold text-sm">
                          {p.label}
                          {p.pctl != null && (
                            <span className="ml-1 font-normal text-xs text-muted-foreground">
                              ({formatPercentile(p.pctl)})
                            </span>
                          )}
                        </span>
                      ))}
                      {log.is_pediatrician_visit && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-4">
                          <Stethoscope className="w-2.5 h-2.5 mr-1" />
                          Peds
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(log.logged_at), "EEEE, MMM d yyyy")}
                      {log.notes && ` · ${log.notes}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(log)}
                      aria-label="Edit measurement"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(log.id)}
                      aria-label="Delete measurement"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Log measurement sheet (also used for editing) */}
      <Sheet
        open={logOpen}
        onOpenChange={(open) => {
          setLogOpen(open);
          if (!open) resetLogForm();
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[90vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>{editingId ? "Edit measurement" : "Log measurement"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <WeightInput
              label="Weight (optional)"
              lbs={logLbs}
              oz={logOz}
              onLbsChange={setLogLbs}
              onOzChange={setLogOz}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Length (optional)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                  value={logLengthIn}
                  onChange={(e) => setLogLengthIn(e.target.value)}
                  className="text-center"
                />
                <p className="text-center text-xs text-muted-foreground">inches</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Head circ. (optional)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                  value={logHeadIn}
                  onChange={(e) => setLogHeadIn(e.target.value)}
                  className="text-center"
                />
                <p className="text-center text-xs text-muted-foreground">inches</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <Input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4" />
                Pediatrician visit
              </Label>
              <Switch checked={logIsPeds} onCheckedChange={setLogIsPeds} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes (optional)</Label>
              <Textarea
                placeholder="Any notes..."
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={2}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => logWeight.mutate()}
              disabled={logWeight.isPending}
            >
              {editingId ? "Save changes" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Baseline setup sheet */}
      <Sheet open={setupOpen} onOpenChange={setSetupOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Birth &amp; discharge weights</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <WeightInput
              label="Birth weight"
              lbs={birthLbs}
              oz={birthOz}
              onLbsChange={setBirthLbs}
              onOzChange={setBirthOz}
            />
            <WeightInput
              label="Discharge weight (from hospital)"
              lbs={dischargeLbs}
              oz={dischargeOz}
              onLbsChange={setDischargeLbs}
              onOzChange={setDischargeOz}
            />
            <p className="text-xs text-muted-foreground">
              Babies typically lose 5–10% of birth weight before discharge. Tracking both gives the full picture.
            </p>
            <Button
              className="w-full"
              onClick={() => saveBaseline.mutate()}
              disabled={saveBaseline.isPending}
            >
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this entry?</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteId && deleteLog.mutate(deleteId)}
              disabled={deleteLog.isPending}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
