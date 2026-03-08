import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UtensilsCrossed } from "lucide-react";

export default function FeedingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <UtensilsCrossed className="w-6 h-6 text-green-500" /> Feeding Tracking
        </h1>
        <p className="text-muted-foreground mt-1">Track breast, bottle, and solid food feeds with detailed logging.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Feeding Logs</CardTitle>
          <CardDescription>No feeding logs yet. Add a child profile to start tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Log feeding type, duration, amount (oz), side (L/R for breast), and food descriptions for solids.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
