import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChildren } from "@/hooks/useChildren";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

export function AddChildDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [isPremature, setIsPremature] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const { addChild } = useChildren();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dob) return;

    try {
      await addChild.mutateAsync({
        name: name.trim(),
        date_of_birth: dob,
        gender: gender || undefined,
        is_premature: isPremature,
        due_date: isPremature && dueDate ? dueDate : undefined,
      });
      toast({ title: "Child added! 🌱", description: `${name} has been added to your profile.` });
      setOpen(false);
      setName(""); setDob(""); setGender(""); setIsPremature(false); setDueDate("");
    } catch {
      toast({ title: "Error", description: "Could not add child. Please try again.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="w-full touch-target gap-2">
            <Plus className="w-5 h-5" /> Add Child
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add a Child</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Baby's name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">Date of Birth</Label>
            <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Gender (optional)</Label>
            <div className="flex gap-2">
              {["boy", "girl", "other"].map((g) => (
                <Button key={g} type="button" variant={gender === g ? "default" : "outline"} size="sm" onClick={() => setGender(g)} className="flex-1 capitalize touch-target">
                  {g}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="premature">Born premature?</Label>
            <Switch id="premature" checked={isPremature} onCheckedChange={setIsPremature} />
          </div>
          {isPremature && (
            <div className="space-y-2">
              <Label htmlFor="dueDate">Original Due Date</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Used to calculate adjusted age for milestones.</p>
            </div>
          )}
          <Button type="submit" className="w-full touch-target" disabled={addChild.isPending}>
            {addChild.isPending ? "Adding..." : "Add Child"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
