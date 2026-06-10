import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BookOpen, ChevronDown } from "lucide-react";
import { getDevelopmentContentForChild, DEV_CONTENT_DISCLAIMER } from "@/data/developmentContent";

interface ChildLite {
  id: string;
  name: string;
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

export function WhatToExpectCard({ activeChild }: { activeChild: ChildLite | null }) {
  const [open, setOpen] = useState(false);
  const entry = getDevelopmentContentForChild(activeChild);
  if (!entry || !activeChild) return null;

  // Fall back to the full name if it's a single token / empty so we never
  // render a bare ": Title". Every DEVELOPMENT_CONTENT entry carries 3 bullets,
  // so the Collapsible below always has rest-bullets + tip to reveal.
  const firstName = activeChild.name.split(" ")[0] || activeChild.name;
  const leadBullets = entry.bullets.slice(0, 2);
  const restBullets = entry.bullets.slice(2);

  return (
    <Card className="border bg-milestones-bg/40 border-milestones/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-3.5 h-3.5 text-milestones" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-milestones">
            This Week
          </span>
          <Badge variant="secondary" className="ml-auto">{entry.ageLabel}</Badge>
        </div>

        <p className="font-display font-bold text-base leading-snug">
          {firstName}: {entry.title}
        </p>

        <ul className="mt-2 space-y-1.5">
          {leadBullets.map((b) => (
            <li key={b.text} className="flex gap-2 text-sm text-foreground/85 leading-snug">
              <span className="text-milestones shrink-0">•</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleContent>
            {restBullets.length > 0 && (
              <ul className="mt-1.5 space-y-1.5">
                {restBullets.map((b) => (
                  <li key={b.text} className="flex gap-2 text-sm text-foreground/85 leading-snug">
                    <span className="text-milestones shrink-0">•</span>
                    <span>{b.text}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 bg-milestones/10 rounded-xl p-3">
              <p className="text-sm text-foreground/90 leading-snug">
                <span className="font-semibold">Try this week:</span> {entry.tip}
              </p>
            </div>

            <p className="text-xs text-muted-foreground mt-3 leading-snug">
              {DEV_CONTENT_DISCLAIMER}
            </p>
          </CollapsibleContent>

          <CollapsibleTrigger className="flex items-center gap-1.5 mt-2 text-sm font-semibold text-milestones touch-target min-h-[48px]">
            {open ? "Show less" : "See more this week"}
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
