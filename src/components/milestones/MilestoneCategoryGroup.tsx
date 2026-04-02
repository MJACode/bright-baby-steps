import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MilestoneCard } from "./MilestoneCard";

interface MilestoneCategoryGroupProps {
  categories: any[];
  milestoneStatuses: Record<string, string>;
  milestonePhotos?: Record<string, string | null>;
  onStatusChange: (milestoneId: string, status: string) => void;
  onPhotoChange?: (milestoneId: string, photoUrl: string | null) => void;
  isPending: boolean;
  ageMonths: number;
  userId?: string;
}

export function MilestoneCategoryGroup({
  categories,
  milestoneStatuses,
  milestonePhotos,
  onStatusChange,
  onPhotoChange,
  isPending,
  ageMonths,
  userId,
}: MilestoneCategoryGroupProps) {
  const nonEmpty = categories.filter((cat) => cat.milestones.length > 0);

  if (nonEmpty.length === 0) return null;

  return (
    <Accordion type="multiple" className="space-y-2">
      {nonEmpty.map((cat) => {
        const catAchieved = cat.milestones.filter(
          (m: any) => (milestoneStatuses[m.id] ?? "not_yet") === "achieved"
        ).length;
        const catPct = cat.milestones.length > 0
          ? Math.round((catAchieved / cat.milestones.length) * 100)
          : 0;

        return (
          <AccordionItem
            key={cat.id}
            value={cat.id}
            className="border rounded-xl px-4 bg-milestones-bg border-0"
          >
            <AccordionTrigger className="hover:no-underline touch-target">
              <div className="flex items-center gap-3 w-full">
                <span className="font-display font-bold">{cat.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {catAchieved}/{cat.milestones.length}
                </Badge>
                <div className="flex-1 max-w-[80px] ml-auto mr-2">
                  <Progress value={catPct} className="h-2" />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pb-2">
                {cat.milestones.map((m: any) => {
                  const status = milestoneStatuses[m.id] ?? "not_yet";
                  const showConcernNote =
                    status !== "achieved" &&
                    m.age_months_concern_flag != null &&
                    ageMonths > m.age_months_concern_flag;

                  return (
                    <MilestoneCard
                      key={m.id}
                      milestone={m}
                      status={status}
                      photoUrl={milestonePhotos?.[m.id]}
                      onStatusChange={onStatusChange}
                      onPhotoChange={onPhotoChange}
                      isPending={isPending}
                      showConcernNote={showConcernNote}
                      userId={userId}
                    />
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
