import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";

interface StreakPopupProps {
  streak: number;
  freezeUsed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StreakPopup({ streak, freezeUsed, open, onOpenChange }: StreakPopupProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="font-display text-lg font-bold text-left">
              {freezeUsed
                ? `🔥 ${streak}-day streak — we saved it for you`
                : `🔥 ${streak}-day tracking streak!`}
            </DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {freezeUsed
            ? "A missed day won't break it."
            : "Keep it going — consistency matters."}
        </p>
        <Button onClick={() => onOpenChange(false)} className="w-full">
          Keep it up
        </Button>
      </DialogContent>
    </Dialog>
  );
}
