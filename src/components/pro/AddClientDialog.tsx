import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAddSlpClient,
  useUpdateSlpClient,
  type SlpClient,
} from "@/hooks/pro/useSlpClients";

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this client instead of adding a new one. */
  client?: SlpClient | null;
}

export function AddClientDialog({ open, onOpenChange, client }: AddClientDialogProps) {
  const addClient = useAddSlpClient();
  const updateClient = useUpdateSlpClient();

  const [displayName, setDisplayName] = useState("");
  const [ageText, setAgeText] = useState("");

  // Re-prefill on every open so a re-opened edit dialog reflects the latest
  // server state, not a click-time snapshot.
  useEffect(() => {
    if (!open) return;
    setDisplayName(client?.display_name ?? "");
    setAgeText(client ? String(client.age_months) : "");
  }, [client, open]);

  const ageMonths = Number(ageText);
  const ageValid = ageText !== "" && Number.isInteger(ageMonths) && ageMonths >= 0 && ageMonths <= 216;
  const canSave = displayName.trim().length > 0 && ageValid;
  const isPending = addClient.isPending || updateClient.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    if (client) {
      updateClient.mutate(
        { clientId: client.id, displayName, ageMonths },
        {
          onSuccess: () => {
            toast.success("Client updated.");
            onOpenChange(false);
          },
        }
      );
    } else {
      addClient.mutate(
        { displayName, ageMonths },
        {
          onSuccess: () => {
            toast.success("Client added to your caseload.");
            onOpenChange(false);
          },
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold">
            {client ? "Edit client" : "Add a client"}
          </DialogTitle>
          <DialogDescription>
            Grace Flare Pro stores the minimum needed for drafting: a first name or initials and an
            age.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-name">First name or initials only</Label>
            <Input
              id="client-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Mia or M.R."
              maxLength={40}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-age">Age in months</Label>
            <Input
              id="client-age"
              type="number"
              inputMode="numeric"
              min={0}
              max={216}
              value={ageText}
              onChange={(e) => setAgeText(e.target.value)}
              placeholder="e.g. 30"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Do not enter diagnoses, medical records, or other personal health information.
          </p>
          <Button
            type="submit"
            className="w-full min-h-[48px] rounded-xl font-bold"
            disabled={!canSave || isPending}
          >
            {isPending ? "Saving…" : client ? "Save changes" : "Add client"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
