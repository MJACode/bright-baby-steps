import { useChildren } from "@/hooks/useChildren";
import { FamilyMomentsCard } from "@/components/FamilyMomentsCard";
import { CaregiverNotePanel } from "@/components/CaregiverNotePanel";
import { VoiceQuickLogButton } from "@/components/VoiceQuickLogButton";

export default function CaregiverHome() {
  const { activeChild } = useChildren();
  if (!activeChild) return null;
  return (
    <div className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8 space-y-4 max-w-md mx-auto">
      <header>
        <p className="text-xs text-muted-foreground">Caring for</p>
        <h1 className="font-display text-3xl font-bold">{activeChild.name}</h1>
      </header>
      {/* Caregivers land here instead of the tabbed dashboard, so this is
          their only entry point into logging sleep/food/diaper/temp — it
          must stand in for the per-tab pages' inline quick-log affordances. */}
      <VoiceQuickLogButton />
      <CaregiverNotePanel childId={activeChild.id} />
      <FamilyMomentsCard childId={activeChild.id} />
    </div>
  );
}
