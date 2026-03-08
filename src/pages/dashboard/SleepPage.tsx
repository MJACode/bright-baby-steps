import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon } from "lucide-react";

export default function SleepPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Moon className="w-7 h-7 text-sleep" /> Sleep
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Log and analyze sleep patterns.</p>
      </div>
      <Card className="border-0 bg-sleep-bg">
        <CardHeader>
          <CardTitle className="text-base">Sleep Logs</CardTitle>
          <CardDescription>No sleep logs yet. Add a child profile to start tracking.</CardDescription>
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