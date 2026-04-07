import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChildren } from "@/hooks/useChildren";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

interface ChildData {
  id: string;
  name: string;
  date_of_birth: string;
  gender?: string | null;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
}

interface AddChildDialogProps {
  trigger?: React.ReactNode;
  /** Pass an existing child to open in edit mode */
  child?: ChildData;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddChildDialog({ trigger, child, open: controlledOpen, onOpenChange }: AddChildDialogProps) {
  const isEditMode = !!child;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [isPremature, setIsPremature] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [isExpected, setIsExpected] = useState(false);

  const { addChild, updateChild } = useChildren();

  // Pre-fill form when editing
  useEffect(() => {
    if (child && open) {
      setName(child.name);
      setDob(child.date_of_birth);
      setGender(child.gender ?? "");
      setIsPremature(child.is_premature ?? false);
      setDueDate(child.due_date ?? "");
      setIsExpected(child.is_expected ?? false);
    }
  }, [child, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dob) return;

    // Determine if the entered date is in the future → auto-set is_expected
    const isDateInFuture = new Date(dob) > new Date();
    const expectedFlag = isExpected || isDateInFuture;

    try {
      if (isEditMode && child) {
        await updateChild.mutateAsync({
          id: child.id,
          name: name.trim(),
          date_of_birth: dob,
          gender: gender || undefined,
          is_premature: expectedFlag ? false : isPremature,
          due_date: !expectedFlag && isPremature && dueDate ? dueDate : undefined,
          is_expected: expectedFlag,
        });
        toast({ title: "Saved! ✏️", description: `${name}'s profile has been updated.` });
      } else {
        await addChild.mutateAsync({
          name: name.trim(),
          date_of_birth: dob,
          gender: gender || undefined,
          is_premature: expectedFlag ? false : isPremature,
          due_date: !expectedFlag && isPremature && dueDate ? dueDate : undefined,
          is_expected: expectedFlag,
        });
        toast({ title: "Child added! 🌱", description: `${name} has been added to your profile.` });
      }
      setOpen(false);
      if (!isEditMode) {
        setName(""); setDob(""); setGender(""); setIsPremature(false); setDueDate(""); setIsExpected(false);
      }
    } catch {
      toast({ title: "Error", description: "Could not save. Please try again.", variant: "destructive" });
    }
  };

  const isFutureDob = dob ? new Date(dob) > new Date() : false;

  const content = (
    <DialogContent className="max-w-sm mx-auto">
      <DialogHeader>
        <DialogTitle className="font-display">{isEditMode ? "Edit Child" : "Add a Child"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Baby's name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dob">{isFutureDob ? "Expected Due Date" : "Date of Birth"}</Label>
          <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
          {isFutureDob && (
            <p className="text-xs text-muted-foreground">
              Future date detected — we'll treat this as an expected baby. You can update the date once your baby arrives.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Gender (optional)</Label>
          <div className="flex gap-2">
            {["boy", "girl", "other"].map((g) => (
              <Button key={g} type="button" variant={gender === g ? "default" : "outline"} size="sm" onClick={() => setGender(gender === g ? "" : g)} className="flex-1 capitalize touch-target">
                {g}
              </Button>
            ))}
          </div>
        </div>
        {!isFutureDob && (
          <div className="flex items-center justify-between">
            <Label htmlFor="premature">Born premature?</Label>
            <Switch id="premature" checked={isPremature} onCheckedChange={setIsPremature} />
          </div>
        )}
        {!isFutureDob && isPremature && (
          <div className="space-y-2">
            <Label htmlFor="dueDate">Original Due Date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Used to calculate adjusted age for milestones.</p>
          </div>
        )}
        <Button type="submit" className="w-full touch-target" disabled={addChild.isPending || updateChild.isPending}>
          {(addChild.isPending || updateChild.isPending) ? "Saving..." : isEditMode ? "Save Changes" : "Add Child"}
        </Button>
      </form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {content}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEditMode && (
        <DialogTrigger asChild>
          <Button className="w-full touch-target gap-2">
            <Plus className="w-5 h-5" /> Add Child
          </Button>
        </DialogTrigger>
      )}
      {content}
    </Dialog>
  );
}
