import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface NursingTimerProps {
  side: string;
  onSideChange: (side: string) => void;
  onDurationChange: (minutes: number) => void;
  initialMinutes?: number;
}

export default function NursingTimer({ side, onSideChange, onDurationChange, initialMinutes }: NursingTimerProps) {
  const [showManual, setShowManual] = useState(!!initialMinutes);
  const [manualMin, setManualMin] = useState(initialMinutes ? String(initialMinutes) : "");

  const handleManualChange = (val: string) => {
    setManualMin(val);
    onDurationChange(val ? Number(val) : 0);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["left", "right", "both"].map((s) => (
          <Button
            key={s}
            type="button"
            variant={side === s ? "default" : "outline"}
            size="sm"
            className={cn("flex-1 capitalize touch-target font-bold")}
            onClick={() => onSideChange(s)}
          >
            {s === "left" ? "◀ Left" : s === "right" ? "Right ▶" : "Both"}
          </Button>
        ))}
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        onClick={() => setShowManual(!showManual)}
      >
        <Clock className="w-3 h-3" />
        Add duration
        {showManual ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>

      {showManual && (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Duration (min)</Label>
          <Input
            type="number"
            value={manualMin}
            onChange={(e) => handleManualChange(e.target.value)}
            placeholder="15"
            className="h-8 text-sm w-24"
          />
        </div>
      )}
    </div>
  );
}
