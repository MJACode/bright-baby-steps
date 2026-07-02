import { useState } from "react";
import { Mic } from "lucide-react";
import { VoiceQuickLog } from "@/components/VoiceQuickLog";

export function VoiceQuickLogButton() {
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setVoiceOpen(true)}
        aria-label="Log by voice"
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors active:scale-[0.99] touch-target text-left"
      >
        <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Mic className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm leading-tight">Log by voice</p>
          <p className="text-xs text-muted-foreground mt-0.5">Tap and say what you need logged.</p>
        </div>
      </button>

      <VoiceQuickLog open={voiceOpen} onOpenChange={setVoiceOpen} />
    </>
  );
}
