// src/components/onboarding/InviteShareSheet.tsx
// Shown right after the user picks a role.
// Three paths: Text it (share sheet) · Show QR · Copy link.
//
// The invite row is created LAZILY — only when the user actually clicks one of
// the three actions. Opening + closing the drawer without acting writes nothing
// to partner_invitations. If the user changes their mind and picks a different
// role after generating an invite for the prior role, the prior unshared
// invite is cancelled so it doesn't linger as an orphan.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { MessageSquare, QrCode, Link2, Check } from "lucide-react";
import {
  createPartnerInvite,
  shareInvite,
  copyInviteUrl,
  ROLE_COPY,
  type PartnerRole,
} from "@/lib/partnerInvite";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  role: PartnerRole;
  babyName: string;
  inviterName?: string;
  /** Called once an invite row exists — wizard captures the code so the user
   *  can find it later from Profile → Partner Access. */
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

  // Track whether an in-flight create call is happening so concurrent button
  // taps don't double-insert.
  const creatingRef = useRef(false);

  // When the role changes, reset internal state. If the prior role had an
  // unshared invite row, cancel it in the background so the orphan doesn't
  // linger in PartnerManagement. Shared invites are left alone — the user may
  // already have texted the link to the recipient.
  useEffect(() => {
    const priorCode = code;
    const priorWasShared = status === "shared";
    setStatus("idle");
    setUrl(null);
    setCode(null);
    setShowQr(false);
    if (priorCode && !priorWasShared) {
      void supabase
        .from("partner_invitations")
        .update({ status: "cancelled" })
        .eq("invite_code", priorCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function ensureInvite(): Promise<{ url: string; code: string } | null> {
    if (url && code) return { url, code };
    if (creatingRef.current) return null;
    creatingRef.current = true;
    setStatus("creating");
    try {
      const r = await createPartnerInvite({ ownerId, role });
      setUrl(r.url);
      setCode(r.inviteCode);
      setStatus("ready");
      return { url: r.url, code: r.inviteCode };
    } catch {
      setStatus("error");
      toast({ title: "Couldn't create invite link", variant: "destructive" });
      return null;
    } finally {
      creatingRef.current = false;
    }
  }

  async function handleShare() {
    const inv = await ensureInvite();
    if (!inv) return;
    const ok = await shareInvite({ url: inv.url, babyName, inviterName, role });
    if (ok) {
      setStatus("shared");
      toast({ title: "Invite sent! 🎉" });
      onSent?.(inv.code);
    }
  }

  async function handleCopy() {
    const inv = await ensureInvite();
    if (!inv) return;
    await copyInviteUrl(inv.url);
    toast({ title: "Link copied" });
    setStatus("shared");
    onSent?.(inv.code);
  }

  async function handleShowQr() {
    const inv = await ensureInvite();
    if (!inv) return;
    setShowQr(true);
    setStatus("shared");
    onSent?.(inv.code);
  }

  const copy = ROLE_COPY[role];
  const busy = status === "creating";

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
          {status === "error" ? (
            <div className="text-center py-8 text-sm text-destructive">
              Something went wrong. Please try again.
            </div>
          ) : showQr && url ? (
            <QrPanel url={url} onBack={() => setShowQr(false)} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ShareTile
                  icon={<MessageSquare className="w-5 h-5" />}
                  title="Text it"
                  sub="Opens Messages"
                  primary
                  disabled={busy}
                  onClick={handleShare}
                />
                <ShareTile
                  icon={<QrCode className="w-5 h-5" />}
                  title="Show QR"
                  sub="If they're with you"
                  disabled={busy}
                  onClick={handleShowQr}
                />
              </div>

              <button
                type="button"
                onClick={handleCopy}
                disabled={busy}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left disabled:opacity-50"
              >
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-xs font-mono text-muted-foreground truncate">
                  {url ?? "Copy invite link"}
                </span>
                <span className="text-xs font-medium text-primary">
                  {busy ? "…" : "Copy"}
                </span>
              </button>

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
  icon, title, sub, primary, disabled, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-[120px] rounded-2xl p-4 text-left flex flex-col gap-2 transition-colors disabled:opacity-50",
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
