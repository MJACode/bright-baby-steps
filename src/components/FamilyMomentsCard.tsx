import { useFamilyMoments, type FamilyMoment } from "@/hooks/useFamilyMoments";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNowStrict } from "date-fns";
import { UtensilsCrossed, Moon, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  feed: { icon: UtensilsCrossed, tone: "text-feeding bg-feeding/10" },
  sleep: { icon: Moon, tone: "text-sleep bg-sleep/10" },
  diaper: { icon: Droplets, tone: "text-diapers bg-diapers/10" },
};

function describe(m: FamilyMoment): string {
  if (m.kind === "feed") {
    const oz = (m.payload as { amount_oz?: number }).amount_oz;
    return oz ? `${oz}oz bottle` : "Feed";
  }
  if (m.kind === "sleep") {
    const min = Math.round(((m.payload as { duration_min?: number }).duration_min ?? 0));
    return min < 5 ? "Started sleeping" : `${min}m sleep`;
  }
  if (m.kind === "diaper") {
    return `${(m.payload as { type?: string }).type ?? "Diaper"} diaper`;
  }
  return "Logged";
}

export function FamilyMomentsCard({ childId }: { childId: string | undefined }) {
  const { user } = useAuth();
  const { data: moments } = useFamilyMoments(childId, 6);

  const authorIds = Array.from(new Set((moments ?? []).map((m) => m.author_id)));
  const { data: authors } = useQuery({
    queryKey: ["author-names", authorIds.sort().join(",")],
    queryFn: async () => {
      if (authorIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles").select("id, full_name").in("id", authorIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name?.split(" ")[0] ?? "Family"]));
    },
    enabled: authorIds.length > 0,
  });

  if (!moments || moments.length === 0) return null;

  return (
    <Card className="border-0 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Family moments
          </p>
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
        </div>
        <ul className="space-y-2.5">
          {moments.map((m) => {
            const meta = ICONS[m.kind];
            const Icon = meta.icon;
            const isYou = m.author_id === user?.id;
            const author = isYou ? "You" : (authors?.[m.author_id] ?? "Family");
            return (
              <li key={`${m.kind}-${m.id}`} className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", meta.tone)}>
                  <Icon className="w-4 h-4" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight">
                    <span className={cn("font-semibold", !isYou && "text-primary")}>{author}</span>{" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    <span>{describe(m)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(m.occurred_at), { addSuffix: true })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
