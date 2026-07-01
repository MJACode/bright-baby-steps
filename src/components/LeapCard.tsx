import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useLeaps } from "@/hooks/useLeaps";
import { openChat } from "@/lib/chatOpener";

interface ChildLite {
  id: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
}

export function LeapCard({ activeChild }: { activeChild: ChildLite | null }) {
  const navigate = useNavigate();
  const { data } = useLeaps(activeChild);

  if (!activeChild) return null;

  const shell = (title: string, body: string, showLeapCta: boolean) => (
    <Card className="border bg-milestones/5 border-milestones/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-milestones/10">
            <Sparkles className="w-3.5 h-3.5 text-milestones" />
          </span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-milestones">
            Developmental Leaps
          </span>
        </div>
        <p className="font-display font-bold text-base leading-snug">{title}</p>
        <p className="text-sm text-foreground/85 leading-snug mt-1">{body}</p>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard/leaps")}
            className="flex-1 min-h-[48px] border-milestones/30 text-milestones hover:bg-milestones/10"
          >
            See all leaps
          </Button>
          {showLeapCta && (
            <Button
              onClick={() =>
                openChat({
                  seedPrompt: "Tell me about my baby's current developmental leap",
                  forceSkill: "developmental",
                  source: "leap_card",
                })
              }
              className="flex-1 min-h-[48px] bg-milestones text-white hover:bg-milestones/90"
            >
              Ask about this leap
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (activeChild.is_expected) {
    return shell(
      "Leaps begin once baby arrives",
      "After your baby is born, we'll guide you through each developmental leap — the fussy stretches and the new skills that often follow.",
      false,
    );
  }

  if (!data) return null;
  const { currentStatus, nextLeap } = data;

  if (currentStatus.phase === "stormy") {
    const n = currentStatus.leap.leapNumber;
    return shell(
      `Leap ${n} may be underway`,
      "Extra fussiness is a normal part of a leap — a burst of new skills often follows. Hang in there; you're doing great.",
      true,
    );
  }

  if (currentStatus.phase === "sunny") {
    return shell("New skills emerging", currentStatus.leap.sunnySummary, true);
  }

  if (nextLeap) {
    return shell(
      `Next leap around week ${nextLeap.leapWeek}`,
      "Things are settled for now. We'll let you know when the next leap may be on its way.",
      false,
    );
  }

  return shell(
    "Leaps complete",
    "Your baby has grown through all the early developmental leaps — what an incredible journey. Keep celebrating every new skill.",
    false,
  );
}
