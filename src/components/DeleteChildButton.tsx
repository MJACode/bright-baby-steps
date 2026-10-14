import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChildren } from "@/hooks/useChildren";
import { toast } from "@/hooks/use-toast";

function childFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

interface DeleteChildButtonProps {
  child: { id: string; name: string };
  onDeleted?: () => void;
}

export function DeleteChildButton({ child, onDeleted }: DeleteChildButtonProps) {
  const { children, deleteChild } = useChildren();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const firstName = childFirstName(child.name);
  const nameMatches = typed.trim().toLocaleLowerCase() === firstName.toLocaleLowerCase() && firstName !== "";
  const deleting = deleteChild.isPending;
  const isLastChild = children.filter((c) => c.id !== child.id).length === 0;

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    if (!next) setTyped("");
  };

  const handleDelete = async () => {
    if (!nameMatches || deleting) return;
    try {
      await deleteChild.mutateAsync({ id: child.id });
      toast({
        title: `${firstName}'s profile is deleted`,
        description: isLastChild
          ? "Your account is still here whenever you're ready to add a child."
          : "Your account and your other children's profiles are unchanged.",
      });
      setOpen(false);
      setTyped("");
      onDeleted?.();
      if (isLastChild) navigate("/dashboard");
    } catch (err) {
      toast({
        title: `Couldn't delete ${firstName}'s profile`,
        description: err instanceof Error ? err.message : "Check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full touch-target gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" /> Delete {firstName}'s profile
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader className="text-left sm:text-left">
          <AlertDialogTitle className="font-display font-bold">Delete {firstName}'s profile?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This removes everything you've saved for {firstName}: every log, milestone, and plan.
                Partners and caregivers you've shared {firstName} with lose access too.
              </p>
              <p className="font-semibold text-foreground">
                This can't be undone. Your account and any other children stay.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-child-confirm" className="text-sm font-semibold">
            Type {firstName} to confirm
          </Label>
          <Input
            id="delete-child-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            disabled={deleting}
            className="min-h-[48px] text-base"
          />
        </div>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={deleting} className="touch-target mt-0 text-sm">
            Keep {firstName}'s profile
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className="touch-target text-sm"
            disabled={!nameMatches || deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? "Deleting…" : `Delete ${firstName}'s profile`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
