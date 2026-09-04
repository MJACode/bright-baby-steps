import { useEffect, useState } from "react";
import { differenceInMonths } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed } from "lucide-react";
import { useNightWindow } from "@/hooks/useNightWindow";
import {
  deriveFeedCoachState,
  feedCoachCopy,
  HUNGER_CUES,
} from "@/lib/feedCoach";

interface ChildLite {
  id: string;
  name: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
  day_start_time?: string | null;
  night_start_time?: string | null;
}

const PILL_TONE = {
  solid: "bg-feeding text-white border-transparent",
  soft: "bg-feeding/15 text-feeding border-transparent",
  muted: "bg-muted text-muted-foreground border-transparent",
} as const;

export function FeedCoachCard({
  activeChild,
  lastFeedAt,
  feedInProgress = false,
}: {
  activeChild: ChildLite;
  lastFeedAt: Date | null;
  feedInProgress?: boolean;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

  // Re-derive once a minute so "it's been Xh" and the watch → due flip stay
  // current without a per-second ticker (feeds move on the scale of hours).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const firstName = activeChild.name.trim().split(/\s+/)[0];

  // Corrected age for preemies, matching the sleep coach convention.
  const ref =
    activeChild.is_premature && activeChild.due_date
      ? new Date(activeChild.due_date)
      : new Date(activeChild.date_of_birth);
  const ageMonths = Math.max(0, differenceInMonths(now, ref));

  const night = useNightWindow({ child: activeChild, ageMonths, now });

  const state = deriveFeedCoachState({
    ageMonths,
    lastFeedAt,
    now,
    isPremature: activeChild.is_premature,
    night,
  });
  const copy = feedCoachCopy(state, firstName);

  return (
    <Card className="border bg-feeding/5 border-feeding/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <UtensilsCrossed className="w-3.5 h-3.5 text-feeding" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-feeding">
            Feed Coach
          </span>
          <Badge
            variant={copy.pill.tone === "solid" ? "default" : "secondary"}
            className={PILL_TONE[copy.pill.tone]}
          >
            {copy.pill.label}
          </Badge>
        </div>

        <p className="font-display font-bold text-base leading-snug">{copy.title}</p>
        <p className="text-sm text-foreground/85 leading-snug mt-1">{copy.body}</p>

        {feedInProgress ? (
          <p className="text-xs text-muted-foreground mt-2">
            A feed is in progress right now.
          </p>
        ) : (
          copy.showCues && (
            <ul className="mt-3 space-y-1">
              {HUNGER_CUES.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2 text-sm text-foreground/85 leading-snug"
                >
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full bg-feeding shrink-0"
                    aria-hidden
                  />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )
        )}

        {copy.notes.map((note) => (
          <p key={note} className="text-xs text-muted-foreground mt-3">
            {note}
          </p>
        ))}

        <p className="text-[11px] text-muted-foreground italic mt-3">
          General guidance — not medical advice.
        </p>
      </CardContent>
    </Card>
  );
}
