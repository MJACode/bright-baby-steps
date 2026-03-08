import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon } from "lucide-react";

export default function SleepPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Moon className="w-6 h-6 text-blue-500" /> Sleep Tracking
        </h1>
        <p className="text-muted-foreground mt-1">Log and analyze your baby's sleep patterns against developmental norms.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sleep Logs</CardTitle>
          <CardDescription>No sleep logs yet. Add a child profile first, then start logging sleep sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Track naps and nighttime sleep with start/end times, quality notes, and trend analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
