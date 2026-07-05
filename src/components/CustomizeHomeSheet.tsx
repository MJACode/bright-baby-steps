import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { Preferences, SetPreferences } from "@/hooks/usePreferences";
import { HOME_SECTIONS, QUICK_TILES } from "@/lib/homeSections";

interface CustomizeHomeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Prefs come from Dashboard's usePreferences instance — hook instances don't
  // sync state with each other, so writing through a local instance here would
  // leave the home grid stale until remount.
  prefs: Preferences;
  setPrefs: SetPreferences;
}

export function CustomizeHomeSheet({ open, onOpenChange, prefs, setPrefs }: CustomizeHomeSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-display">Customize your home</SheetTitle>
          <SheetDescription>Choose the shortcuts and cards that show up on your home screen.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick access tiles</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add shortcuts for anything you track.</p>
          </div>
          {QUICK_TILES.map((tile) => {
            const Icon = tile.icon;
            const checked = prefs.homeQuickTiles.includes(tile.id);
            return (
              <div key={tile.id} className="flex items-center justify-between min-h-[48px]">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{tile.label}</p>
                    <p className="text-xs text-muted-foreground">{tile.hint}</p>
                  </div>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(on) => {
                    const enabled = new Set(prefs.homeQuickTiles);
                    if (on) enabled.add(tile.id);
                    else enabled.delete(tile.id);
                    setPrefs({ homeQuickTiles: QUICK_TILES.map((t) => t.id).filter((id) => enabled.has(id)) });
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Home cards</p>
          {HOME_SECTIONS.map((section) => {
            const Icon = section.icon;
            const checked = !prefs.hiddenHomeSections.includes(section.id);
            return (
              <div key={section.id} className="flex items-center justify-between min-h-[48px]">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{section.label}</p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(on) => {
                    const next = on
                      ? prefs.hiddenHomeSections.filter((id) => id !== section.id)
                      : [...prefs.hiddenHomeSections, section.id];
                    setPrefs({ hiddenHomeSections: next });
                  }}
                />
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
