import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { usePreferences } from "@/hooks/usePreferences";
import { HOME_SECTIONS } from "@/lib/homeSections";

interface CustomizeHomeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomizeHomeSheet({ open, onOpenChange }: CustomizeHomeSheetProps) {
  const { prefs, setPrefs } = usePreferences();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-display">Customize your home</SheetTitle>
          <SheetDescription>Choose which cards show up on your home screen.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {HOME_SECTIONS.map((section) => {
            const Icon = section.icon;
            const checked = !prefs.hiddenHomeSections.includes(section.id);
            return (
              <div key={section.id} className="flex items-center justify-between">
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
