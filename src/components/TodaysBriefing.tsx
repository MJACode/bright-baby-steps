import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, AlertTriangle, Target, Activity, Loader2 } from "lucide-react";

interface TodaysBriefingProps {
  activeChild: {
    id: string;
    date_of_birth: string;
    is_premature?: boolean | null;
    due_date?: string | null;
    next_appointment?: string | null;
  } | null;
  todayFeeds: number;
}

interface BriefingData {
  status: string;
  watch: string;
  focus: string;
}

export function TodaysBriefing({ activeChild }: TodaysBriefingProps) {
  const { data: briefing, isLoading } = useQuery<BriefingData | null>({
    queryKey: ["ai-briefing", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("briefing", {
        body: { childId: activeChild!.id },
      });
      if (error) throw error;
      return data as BriefingData;
    },
    enabled: !!activeChild,
    staleTime: 60 * 60 * 1000, // 1 hour cache
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  if (!activeChild) return null;

  const items = briefing
    ? [
        { icon: Activity, text: briefing.status },
        { icon: AlertTriangle, text: briefing.watch },
        { icon: Target, text: briefing.focus },
      ]
    : null;

  return (
    <Card className="border-0 bg-accent/40">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-foreground/70" />
          <span className="text-xs font-bold uppercase tracking-wide text-accent-foreground/70">
            Today's Briefing
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent-foreground/50" />
            <span className="text-sm text-accent-foreground/60">Generating your briefing…</span>
          </div>
        ) : items ? (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <item.icon className="w-3.5 h-3.5 mt-0.5 text-accent-foreground/50 shrink-0" />
                <span className="text-sm text-accent-foreground/90 leading-snug">{item.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-accent-foreground/70">
            Log some activities to unlock your daily AI briefing 💛
          </p>
        )}
      </CardContent>
    </Card>
  );
}
