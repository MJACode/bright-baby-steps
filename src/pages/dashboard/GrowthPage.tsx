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
import { Scale, Plus, Stethoscope, TrendingUp, TrendingDown, Minus, Pencil, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

  // Log weight form state
  const [logDate, setLogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [logLbs, setLogLbs] = useState("");
  const [logOz, setLogOz] = useState("");
  const [logIsPeds, setLogIsPeds] = useState(false);
  const [logNotes, setLogNotes] = useState("");

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
        weight_oz: number;
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

  // Insert weight log
  const logWeight = useMutation({
    mutationFn: async () => {
      const lbs = parseFloat(logLbs) || 0;
      const oz = parseFloat(logOz) || 0;
      const totalOz = lbsOzToOz(lbs, oz);
      if (totalOz <= 0) throw new Error("Enter a valid weight.");
      const { error } = await supabase.from("weight_logs").insert({
        child_id: childId!,
        weight_oz: totalOz,
        logged_at: logDate,
        is_pediatrician_visit: logIsPeds,
        notes: logNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weight-logs", childId] });
      toast({ title: "Weight logged" });
      setLogOpen(false);
      setLogLbs(""); setLogOz(""); setLogNotes(""); setLogIsPeds(false);
      setLogDate(format(new Date(), "yyyy-MM-dd"));
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

  const currentLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const currentOz = currentLog?.weight_oz ?? null;
  const birthOzVal = child?.birth_weight_oz ?? null;
  const dischargeOzVal = child?.discharge_weight_oz ?? null;

  const vsbirthPct = currentOz != null && birthOzVal ? pctChange(currentOz, birthOzVal) : null;
  const goalReached = vsbirthPct != null && vsbirthPct >= 0;

  // Last pediatrician visit weight (most recent is_pediatrician_visit = true)
  const lastPedsLog = [...logs].reverse().find((l) => l.is_pediatrician_visit);
  const sinceLastPeds =
    currentOz != null && lastPedsLog && lastPedsLog.id !== currentLog?.id
      ? currentOz - lastPedsLog.weight_oz
      : null;

  // Chart data
  const chartData = logs.map((l) => ({
    date: format(parseISO(l.logged_at), "M/d"),
    oz: l.logged_at,
    weight: l.weight_oz / 16,
    label: displayWeight(l.weight_oz),
    isPeds: l.is_pediatrician_visit,
  }));

  const birthWeightLine = birthOzVal ? birthOzVal / 16 : undefined;

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
        <p className="text-muted-foreground">Add a child to start tracking weight</p>
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
            Log weight
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

      {/* Stat cards */}
      <div className="flex gap-3">
        <StatCard
          title="Current"
          value={displayWeight(currentOz)}
          sub={currentLog ? format(parseISO(currentLog.logged_at), "MMM d") : undefined}
          icon={<Scale className="w-3.5 h-3.5" />}
        />
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
              : birthOzVal
              ? displayWeight(birthOzVal)
              : "Set birth weight"
          }
          delta={vsbirthPct}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
        />
        <StatCard
          title="Since last visit"
          value={
            sinceLastPeds != null
              ? `${sinceLastPeds >= 0 ? "+" : ""}${displayWeight(Math.abs(sinceLastPeds))}`
              : "—"
          }
          sub={
            lastPedsLog
              ? format(parseISO(lastPedsLog.logged_at), "MMM d")
              : "No visit logged"
          }
          delta={sinceLastPeds}
          icon={<Stethoscope className="w-3.5 h-3.5" />}
        />
      </div>

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
      {logs.length > 1 && (
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
              No weigh-ins logged yet
            </p>
          ) : (
            [...logs].reverse().map((log) => {
              const { lbs, oz } = ozToLbsOz(log.weight_oz);
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {lbs} lbs {oz} oz
                      </span>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(log.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Log weight sheet */}
      <Sheet open={logOpen} onOpenChange={setLogOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>Log weight</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <WeightInput
              label="Weight"
              lbs={logLbs}
              oz={logOz}
              onLbsChange={setLogLbs}
              onOzChange={setLogOz}
            />
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
              Save
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
