import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRequestFeature, type RequestableFeature } from "@/hooks/useRequestFeature";

interface FeatureRequestCardProps {
  feature: RequestableFeature;
  title: string;
  description: string;
}

export function FeatureRequestCard({ feature, title, description }: FeatureRequestCardProps) {
  const { requested, request, isPending } = useRequestFeature(feature);

  return (
    <Card className="border border-primary/20 bg-primary/5">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
            <p className="text-sm leading-relaxed text-foreground/80">{description}</p>
          </div>
        </div>

        {requested ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 min-h-[48px] text-sm font-semibold text-primary"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            Request sent — thanks! We'll let you know when it's ready.
          </div>
        ) : (
          <Button
            className="w-full touch-target min-h-[48px] rounded-2xl text-sm font-bold"
            onClick={request}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending your request…
              </>
            ) : (
              "Request early access"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
