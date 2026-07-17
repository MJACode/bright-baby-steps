import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRevokeHomeProgram, type SlpHomeProgramRow } from "@/hooks/pro/useHomePrograms";

interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: Pick<SlpHomeProgramRow, "id" | "client_id" | "share_token" | "expires_at"> | null;
}

export function ShareLinkDialog({ open, onOpenChange, program }: ShareLinkDialogProps) {
  const revoke = useRevokeHomeProgram();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  useEffect(() => {
    if (!open) setConfirmingRevoke(false);
  }, [open]);

  if (!program) return null;

  const url = `${window.location.origin}/hp/${program.share_token}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — ready to send to the family.");
    } catch {
      toast.error("Couldn't copy automatically — select the link text and copy it manually.");
    }
  };

  const handleRevoke = () => {
    revoke.mutate(
      { programId: program.id, clientId: program.client_id },
      {
        onSuccess: () => {
          toast.success("Link revoked. The family can no longer open it.");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            Share with the family
          </DialogTitle>
          <DialogDescription>
            Anyone with this link can view the program and check off practice days — share it only
            with the family, and avoid posting it anywhere public or in group chats. No app or
            account needed on their end.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted/50 border p-3 text-xs break-all select-all">{url}</div>

        <Button className="w-full min-h-[48px] rounded-xl font-bold" onClick={handleCopy}>
          <Copy className="w-4 h-4 mr-2" /> Copy link
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Link works until {format(parseISO(program.expires_at), "MMMM d, yyyy")}.
        </p>

        {confirmingRevoke ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Revoking turns the link off immediately for the family. This can't be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-[48px] rounded-xl"
                onClick={() => setConfirmingRevoke(false)}
              >
                Keep link
              </Button>
              <Button
                variant="destructive"
                className="flex-1 min-h-[48px] rounded-xl font-bold"
                onClick={handleRevoke}
                disabled={revoke.isPending}
              >
                {revoke.isPending ? "Revoking…" : "Revoke link"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full min-h-[48px] rounded-xl text-destructive hover:text-destructive"
            onClick={() => setConfirmingRevoke(true)}
          >
            Revoke this link
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
