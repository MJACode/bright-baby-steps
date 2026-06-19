import { Button } from "@/components/ui/button";
import { ExternalLink, Phone } from "lucide-react";

type Severity = "watch" | "concern" | "act";

interface Props {
  severity: Severity;
  /** The milestone row's existing CDC / clinical source URL, used for the
   *  "Find my state's program" CTA. Never invent a URL — fall back to the
   *  1-800 number when this is absent. */
  sourceUrl?: string | null;
}

const CDC_INFO_TEL = "1-800-232-4636";
const CDC_INFO_LABEL = "1-800-CDC-INFO (1-800-232-4636)";

export function EarlyInterventionExplainer({ severity, sourceUrl }: Props) {
  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="font-display font-bold text-sm">Typical, or worth a check-in?</p>

      {severity === "act" && (
        <p className="text-sm font-semibold text-foreground/90 leading-relaxed">
          You don't have to wait for your next visit to ask.
        </p>
      )}

      <p className="text-sm text-foreground/90 leading-relaxed">
        Lots of babies reach this skill a little later and catch up just fine — wide age ranges are normal. If you'd feel better having someone take a look, you don't have to wait and you don't need a diagnosis to ask.
      </p>

      <p className="text-sm text-foreground/90 leading-relaxed">
        Early Intervention is a free, state-run program for children from birth to age 3. You can request a free evaluation yourself — no doctor's referral and no diagnosis needed. Every state has one (the names vary), and it's there for exactly this kind of "let's just check" moment.
      </p>

      <p className="text-sm text-foreground/90 leading-relaxed">
        To find your state's program, call 1-800-CDC-INFO (1-800-232-4636) or ask your pediatrician — they can point you to it.
      </p>

      {sourceUrl ? (
        <Button asChild className="w-full touch-target bg-primary text-primary-foreground hover:bg-primary/90">
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            Find my state's program
            <ExternalLink className="w-4 h-4 ml-1.5" />
          </a>
        </Button>
      ) : (
        <Button asChild className="w-full touch-target bg-primary text-primary-foreground hover:bg-primary/90">
          <a href={`tel:${CDC_INFO_TEL}`}>
            <Phone className="w-4 h-4 mr-1.5" />
            {CDC_INFO_LABEL}
          </a>
        </Button>
      )}
    </div>
  );
}
