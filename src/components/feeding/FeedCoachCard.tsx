import { useEffect, useState } from "react";
import { differenceInMonths } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed } from "lucide-react";
import {
  deriveFeedCoachState,
  formatHoursSince,
  HUNGER_CUES,
} from "@/lib/feedCoach";

interface ChildLite {
  name: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

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

  const state = deriveFeedCoachState({ ageMonths, lastFeedAt, now });

  const { title, cue } = (() => {
    switch (state.kind) {
      case "due":
        return {
          title: `It's been ${formatHoursSince(state.hoursSince)} since ${firstName}'s last feed`,
          cue: `Babies this age usually feed ${state.guidance.typicalCadence}. If you spot hunger cues, it's a good time to offer a feed.`,
        };
      case "watch":
        return {
          title: `Last feed was ${formatHoursSince(state.hoursSince)} ago`,
          cue: `Watch for ${firstName}'s hunger cues — feeds are on demand, so offer whenever the cues show up.`,
        };
      case "no-data":
        return {
          title: `Watch for ${firstName}'s hunger cues`,
          cue: `Babies this age usually feed ${state.guidance.typicalCadence}. Log a feed to start tracking the rhythm.`,
        };
    }
  })();

  const pill =
    state.kind === "due" ? (
      <Badge variant="default" className="bg-feeding text-white border-transparent">
        Consider a feed
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-feeding/15 text-feeding border-transparent">
        Watch for cues
      </Badge>
    );

  return (
    <Card className="border bg-feeding/5 border-feeding/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <UtensilsCrossed className="w-3.5 h-3.5 text-feeding" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-feeding">
            Feed Coach
          </span>
          {pill}
        </div>

        <p className="font-display font-bold text-base leading-snug">{title}</p>
        <p className="text-sm text-foreground/85 leading-snug mt-1">{cue}</p>

        {feedInProgress ? (
          <p className="text-xs text-muted-foreground mt-2">
            A feed is in progress right now.
          </p>
        ) : (
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
        )}

        {state.guidance.note && (
          <p className="text-xs text-muted-foreground mt-3">{state.guidance.note}</p>
        )}

        <p className="text-[11px] text-muted-foreground italic mt-3">
          General guidance — not medical advice.
        </p>
      </CardContent>
    </Card>
  );
}
