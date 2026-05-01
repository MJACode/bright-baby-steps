// src/components/onboarding/InviteShareSheet.tsx
// Shown right after the user picks a role.
// Three paths: Text it (share sheet) · Show QR · Copy link.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { MessageSquare, QrCode, Link2, Check, Loader2 } from "lucide-react";
import {
  createPartnerInvite,
  shareInvite,
  copyInviteUrl,
  ROLE_COPY,
  type PartnerRole,
} from "@/lib/partnerInvite";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  role: PartnerRole;
  babyName: string;
  inviterName?: string;
  /** Called when the invite has been shared/copied — wizard can advance. */
  onSent?: (inviteCode: string) => void;
}

type Status = "idle" | "creating" | "ready" | "shared" | "error";

export function InviteShareSheet({
  open, onOpenChange, ownerId, role, babyName, inviterName, onSent,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Generate the invite as soon as the sheet opens
  useEffect(() => {
    if (!open || url) return;
    let cancelled = false;
    (async () => {
      setStatus("creating");
      try {
        const r = await createPartnerInvite({ ownerId, role });
        if (cancelled) return;
        setUrl(r.url);
        setCode(r.inviteCode);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
        toast({ title: "Couldn't create invite link", variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
  }, [open, ownerId, role, url]);

  const copy = ROLE_COPY[role];

  async function handleShare() {
    if (!url) return;
    const ok = await shareInvite({ url, babyName, inviterName, role });
    if (ok) {
      setStatus("shared");
      toast({ title: "Invite sent! 🎉" });
      if (code) onSent?.(code);
    }
  }

  async function handleCopy() {
    if (!url) return;
    await copyInviteUrl(url);
    toast({ title: "Link copied" });
    setStatus("shared");
    if (code) onSent?.(code);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Invite as {copy.title.toLowerCase()}</DrawerTitle>
          <DrawerDescription>
            They'll create their own account and start tracking {babyName} with you.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-3">
          {status === "creating" && (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating invite…
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-8 text-sm text-destructive">
              Something went wrong. Please try again.
            </div>
          )}

          {(status === "ready" || status === "shared") && url && (
            <>
              {!showQr ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <ShareTile
                      icon={<MessageSquare className="w-5 h-5" />}
                      title="Text it"
                      sub="Opens Messages"
                      primary
                      onClick={handleShare}
                    />
                    <ShareTile
                      icon={<QrCode className="w-5 h-5" />}
                      title="Show QR"
                      sub="If they're with you"
                      onClick={() => setShowQr(true)}
                    />
                  </div>

                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left"
                  >
                    <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs font-mono text-muted-foreground truncate">
                      {url}
                    </span>
                    <span className="text-xs font-medium text-primary">Copy</span>
                  </button>
                </>
              ) : (
                <QrPanel url={url} onBack={() => setShowQr(false)} />
              )}

              {status === "shared" && (
                <div className="flex items-center gap-2 text-sm text-primary px-1">
                  <Check className="w-4 h-4" />
                  Invite sent. They have 7 days to join.
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                {status === "shared" ? "Continue" : "I'll send this later"}
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ShareTile({
  icon, title, sub, primary, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-[120px] rounded-2xl p-4 text-left flex flex-col gap-2 transition-colors",
        primary
          ? "bg-foreground text-background hover:bg-foreground/90"
          : "bg-card text-foreground border border-border hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center",
          primary ? "bg-background/10" : "bg-muted"
        )}
      >
        {icon}
      </span>
      <span className="mt-auto">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] opacity-70">{sub}</div>
      </span>
    </button>
  );
}

function QrPanel({ url, onBack }: { url: string; onBack: () => void }) {
  // Use a public QR endpoint — keeps the bundle tiny.
  // Server-rendered PNG, 240px square.
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <img
        src={qrSrc}
        alt="Invite QR code"
        width={240}
        height={240}
        className="rounded-2xl border border-border bg-white p-2"
      />
      <p className="text-xs text-muted-foreground text-center max-w-[260px]">
        Have them open the camera and point at this code.
      </p>
      <Button variant="ghost" onClick={onBack} className="text-xs">
        Back to other options
      </Button>
    </div>
  );
}
