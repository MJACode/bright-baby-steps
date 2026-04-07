import { useState } from "react";
import { useChildren, getAge } from "@/hooks/useChildren";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddChildDialog } from "@/components/AddChildDialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { ChevronDown, Plus, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ChildSwitcher({ externalOpen, onExternalOpenChange }: { externalOpen?: boolean; onExternalOpenChange?: (open: boolean) => void }) {
  const { children, activeChild, setSelectedChildId } = useChildren();
  const [internalOpen, setInternalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<(typeof children)[0] | null>(null);

  const open = externalOpen !== undefined ? externalOpen || internalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onExternalOpenChange?.(v);
  };

  if (!activeChild) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 transition-colors hover:bg-secondary/80 active:scale-[0.97] cursor-pointer"
        )}
      >
        <Avatar className="h-6 w-6 text-[10px]">
          {activeChild.photo_url && <AvatarImage src={activeChild.photo_url} alt={activeChild.name} />}
          <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
            {getInitials(activeChild.name)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-semibold">{activeChild.name}</span>
        {children.length > 1 && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-display">Switch Child</DrawerTitle>
            <DrawerDescription>Select which child to view</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2 space-y-1">
            {children.map((child) => {
              const ageStr = getAge(child.date_of_birth, child.is_premature ?? false, child.due_date);
              const isExpected = (child as any).is_expected;
              return (
                <div key={child.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChildId(child.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex-1 flex items-center gap-3 rounded-xl p-3 transition-colors text-left",
                      child.id === activeChild.id
                        ? "bg-primary/10"
                        : "hover:bg-secondary"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      {child.photo_url && <AvatarImage src={child.photo_url} alt={child.name} />}
                      <AvatarFallback className="bg-primary/20 text-primary font-bold">
                        {getInitials(child.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{child.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isExpected
                          ? ageStr
                          : `${ageStr} old${child.is_premature ? " (adjusted)" : ""}`}
                      </p>
                    </div>
                    {child.id === activeChild.id && (
                      <Check className="w-5 h-5 text-primary shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingChild(child)}
                    className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors shrink-0"
                    aria-label={`Edit ${child.name}`}
                  >
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-4 pb-6 pt-1">
            <AddChildDialog
              trigger={
                <button
                  type="button"
                  className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-secondary transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-primary">Add another child</span>
                </button>
              }
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Edit child dialog — rendered outside the Drawer so it can open on top */}
      {editingChild && (
        <AddChildDialog
          child={editingChild}
          open={!!editingChild}
          onOpenChange={(v) => { if (!v) setEditingChild(null); }}
        />
      )}
    </>
  );
}
