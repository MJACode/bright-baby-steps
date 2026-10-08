import { Link } from "react-router-dom";
import { useChildren } from "@/hooks/useChildren";
import { FamilyMomentsCard } from "@/components/FamilyMomentsCard";
import { CaregiverNotePanel } from "@/components/CaregiverNotePanel";
import { QUICK_TILES } from "@/lib/homeSections";
import { cn } from "@/lib/utils";

const LOG_TILES = (["sleep", "food", "diaper"] as const).map((id) => {
  const tile = QUICK_TILES.find((t) => t.id === id)!;
  return { ...tile, label: id === "food" ? "Feed" : tile.label };
});

export default function CaregiverHome() {
  const { activeChild } = useChildren();
  if (!activeChild) return null;
  return (
    <div className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8 space-y-4 max-w-md mx-auto">
      <header>
        <p className="text-xs text-muted-foreground">Caring for</p>
        <h1 className="font-display text-3xl font-bold">{activeChild.name}</h1>
      </header>
      <section aria-labelledby="caregiver-log-heading" className="space-y-2">
        <h2 id="caregiver-log-heading" className="text-sm font-semibold text-muted-foreground">
          Tap to log
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {LOG_TILES.map((tile) => (
            <Link
              key={tile.id}
              to={tile.path}
              aria-label={`Log ${tile.label.toLowerCase()}`}
              className={cn(
                "flex flex-col items-center justify-center gap-2 min-h-[96px] p-3 rounded-2xl active:scale-[0.97] transition-transform touch-target",
                tile.tile,
              )}
            >
              <span className={cn("w-12 h-12 rounded-xl flex items-center justify-center", tile.chip)}>
                <tile.icon className="w-6 h-6" strokeWidth={2} />
              </span>
              <span className={cn("text-sm font-semibold", tile.labelColor)}>{tile.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <CaregiverNotePanel childId={activeChild.id} />
      <FamilyMomentsCard childId={activeChild.id} />
    </div>
  );
}
