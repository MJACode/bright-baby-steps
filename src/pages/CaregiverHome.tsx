import { useChildren } from "@/hooks/useChildren";
import { QuickLogFAB } from "@/components/QuickLogFAB";
import { FamilyMomentsCard } from "@/components/FamilyMomentsCard";
import { CaregiverNotePanel } from "@/components/CaregiverNotePanel";

export default function CaregiverHome() {
  const { activeChild } = useChildren();
  if (!activeChild) return null;
  return (
    <div className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-32 space-y-4 max-w-md mx-auto">
      <header>
        <p className="text-xs text-muted-foreground">Caring for</p>
        <h1 className="font-display text-3xl font-bold">{activeChild.name}</h1>
      </header>
      <CaregiverNotePanel childId={activeChild.id} />
      <FamilyMomentsCard childId={activeChild.id} />
      <QuickLogFAB />
    </div>
  );
}
