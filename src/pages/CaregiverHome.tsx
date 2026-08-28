import { useChildren } from "@/hooks/useChildren";
import { FamilyMomentsCard } from "@/components/FamilyMomentsCard";
import { CaregiverNotePanel } from "@/components/CaregiverNotePanel";

export default function CaregiverHome() {
  const { activeChild } = useChildren();
  if (!activeChild) return null;
  return (
    <div className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8 space-y-4 max-w-md mx-auto">
      <header>
        <p className="text-xs text-muted-foreground">Caring for</p>
        <h1 className="font-display text-3xl font-bold">{activeChild.name}</h1>
      </header>
      {/* NOTE: caregivers currently have no logging affordance here. Voice
          quick-log was this surface's only entry point into logging
          sleep/food/diaper/temp, and it was removed with the voice feature;
          DashboardLayout short-circuits the caregiver role to this page on
          every route, so they can't reach the per-tab log forms either. */}
      <CaregiverNotePanel childId={activeChild.id} />
      <FamilyMomentsCard childId={activeChild.id} />
    </div>
  );
}
