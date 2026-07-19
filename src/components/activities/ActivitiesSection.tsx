import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { usePremium } from "@/hooks/usePremium";
import { PremiumGate } from "@/components/PremiumGate";
import { useActivityCompletions, useToggleActivityTried } from "@/hooks/useActivityCompletions";
import {
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  getActivitiesForAge,
  getEarlierActivities,
  getUpcomingActivities,
  type Activity,
  type ActivityDomain,
} from "@/data/activityLibrary";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { ActivityDetailSheet } from "@/components/activities/ActivityDetailSheet";
import { ActivityPlan } from "@/components/activities/ActivityPlan";
import type { Database } from "@/integrations/supabase/types";

type ChildRow = Database["public"]["Tables"]["children"]["Row"];

interface MilestoneRef {
  id: string;
  name: string;
}

interface ActivitiesSectionProps {
  child: ChildRow;
  ageMonths: number;
  categories?: { milestones: MilestoneRef[] }[];
  milestoneStatuses: Record<string, string>;
}

export function ActivitiesSection({
  child,
  ageMonths,
  categories,
  milestoneStatuses,
}: ActivitiesSectionProps) {
  const { user } = useAuth();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const { data: triedSlugs } = useActivityCompletions(child.id);
  const toggleTried = useToggleActivityTried();

  const [domainFilter, setDomainFilter] = useState<"all" | ActivityDomain>("all");
  const [sheetActivity, setSheetActivity] = useState<Activity | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const milestones = useMemo(
    () => (categories ?? []).flatMap((c) => c.milestones),
    [categories]
  );

  const inBand = useMemo(() => getActivitiesForAge(ageMonths), [ageMonths]);
  const upcoming = useMemo(() => getUpcomingActivities(ageMonths), [ageMonths]);
  const earlier = useMemo(() => getEarlierActivities(ageMonths), [ageMonths]);

  const isTried = (a: Activity) => triedSlugs?.has(a.id) ?? false;

  const openActivity = (a: Activity) => {
    setSheetActivity(a);
    setSheetOpen(true);
  };

  const handleToggleTried = (activity: Activity, tried: boolean) => {
    if (!user) return;
    toggleTried.mutate({
      childId: child.id,
      parentId: user.id,
      activitySlug: activity.id,
      tried,
    });
  };

  const planProps = {
    childId: child.id,
    childName: child.name,
    ageMonths,
    isPremature: child.is_premature ?? false,
    interests: child.interests ?? [],
    temperament: child.temperament ?? null,
  };

  const cardGrid = (list: Activity[]) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((a) => (
        <ActivityCard key={a.id} activity={a} tried={isTried(a)} onOpen={() => openActivity(a)} />
      ))}
    </div>
  );

  const sheet = (
    <ActivityDetailSheet
      activity={sheetActivity}
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      tried={sheetActivity ? isTried(sheetActivity) : false}
      onToggleTried={handleToggleTried}
      togglePending={toggleTried.isPending}
      milestones={milestones}
      milestoneStatuses={milestoneStatuses}
    />
  );

  // Wait for the subscription fetch before choosing a layout so premium users
  // never flash the teaser view (and free users never flash the full plan).
  if (premiumLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isPremium) {
    const sorted = [...inBand].sort(
      (a, b) =>
        DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) ||
        a.id.localeCompare(b.id)
    );
    const teasers: Activity[] = [];
    const seenDomains = new Set<ActivityDomain>();
    for (const a of sorted) {
      if (seenDomains.has(a.domain)) continue;
      seenDomains.add(a.domain);
      teasers.push(a);
      if (teasers.length === 3) break;
    }
    const remaining = inBand.length - teasers.length;

    return (
      <div className="space-y-5">
        <PremiumGate
          feature="activity-library"
          variant="replace"
          label="Weekly Play Plan"
          description="Unlock with Flare+ — a 7-day play plan built around your baby's age, interests, and temperament."
        >
          <ActivityPlan {...planProps} />
        </PremiumGate>

        {teasers.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-display font-bold text-lg">Try these today</h2>
            {cardGrid(teasers)}
            {remaining > 0 && (
              <PremiumGate
                feature="activity-library"
                variant="replace"
                label={`${remaining} more activities for this age`}
                description="Unlock with Flare+ — the full library of age-matched play ideas across all five domains."
              >
                <></>
              </PremiumGate>
            )}
          </div>
        )}

        {sheet}
      </div>
    );
  }

  const filteredInBand =
    domainFilter === "all" ? inBand : inBand.filter((a) => a.domain === domainFilter);
  const filteredUpcoming =
    domainFilter === "all" ? upcoming : upcoming.filter((a) => a.domain === domainFilter);
  const filteredEarlier =
    domainFilter === "all" ? earlier : earlier.filter((a) => a.domain === domainFilter);

  const filterChip = (value: "all" | ActivityDomain, label: string) => {
    const active = domainFilter === value;
    return (
      <button
        key={value}
        onClick={() => setDomainFilter(value)}
        aria-pressed={active}
        className={`touch-target min-h-[48px] px-4 rounded-full text-sm font-semibold transition-colors ${
          active
            ? "bg-milestones text-white"
            : "bg-background border border-milestones/20 text-muted-foreground"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <PremiumGate
        feature="activity-library"
        variant="replace"
        label="Weekly Play Plan"
        description="Unlock with Flare+ — a 7-day play plan built around your baby's age, interests, and temperament."
      >
        <ActivityPlan {...planProps} />
      </PremiumGate>

      <div className="space-y-3">
        <h2 className="font-display font-bold text-lg">Right now ({ageMonths}mo)</h2>

        <div className="flex flex-wrap gap-2">
          {filterChip("all", "All")}
          {DOMAIN_ORDER.map((d) => filterChip(d, DOMAIN_LABELS[d]))}
        </div>

        {filteredInBand.length > 0 ? (
          cardGrid(filteredInBand)
        ) : (
          <p className="text-sm text-muted-foreground">
            {domainFilter !== "all"
              ? `${DOMAIN_LABELS[domainFilter as ActivityDomain]} ideas for this age are coming up — peek at the sections below.`
              : "New activities for this age are coming up — peek at the sections below."}
          </p>
        )}
      </div>

      {filteredUpcoming.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
            <h2 className="font-display font-bold text-lg text-muted-foreground">Coming up next</h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">{cardGrid(filteredUpcoming)}</CollapsibleContent>
        </Collapsible>
      )}

      {filteredEarlier.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
            <h2 className="font-display font-bold text-lg text-muted-foreground">
              Earlier favorites
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">{cardGrid(filteredEarlier)}</CollapsibleContent>
        </Collapsible>
      )}

      {sheet}
    </div>
  );
}
