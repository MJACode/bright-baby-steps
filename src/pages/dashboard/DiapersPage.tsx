import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplets } from "lucide-react";

export default function DiapersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Droplets className="w-6 h-6 text-amber-500" /> Diaper Tracking
        </h1>
        <p className="text-muted-foreground mt-1">Quick, frictionless logging with early health warning pattern detection.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Diaper Logs</CardTitle>
          <CardDescription>No diaper logs yet. Add a child profile to start tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Log type (wet/dirty/both), color, consistency, and flag entries that need pediatrician attention.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
