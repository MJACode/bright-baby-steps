// src/components/onboarding/InviteShareSheet.tsx
// Shown right after the user picks a role.
// Three paths: Text it (share sheet) · Show QR · Copy link.
//
// The invite row is created LAZILY — only when the user actually clicks one of
// the three actions. Opening + closing without acting writes nothing to
// partner_invitations. If the user changes their mind and picks a different
// role after generating an invite for the prior role, the prior unshared
// invite is cancelled so it doesn't linger as an orphan.
//
// `InviteShareBody` is the drawer-less body so the team page can swap it into
// its own invite drawer instead of stacking a second sheet.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { MessageSquare, QrCode, Link2, Check } from "lucide-react";
import {
  createPartnerInvite,
  shareInvite,
  copyInviteUrl,
  ROLE_COPY,
  describePartnerError,
  type PartnerRole,
} from "@/lib/partnerInvite";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const CREATE_FAILED = "Couldn't create the link. Check your connection and try again.";

interface BodyProps {
  ownerId: string;
  role: PartnerRole;
  babyName: string;
  /** What the owner calls them — stored as partner_invitations.invitee_label. */
  label?: string;
  /** Called once an invite row exists and has been handed off. */
  onSent?: (inviteCode: string) => void;
  /** Closes the surrounding sheet. */
  onDone: () => void;
}

type Status = "idle" | "creating" | "ready" | "shared" | "error";

export function InviteShareBody({ ownerId, role, babyName, label, onSent, onDone }: BodyProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Guards concurrent taps from double-inserting.
  const creatingRef = useRef(false);

  // When the role changes, reset internal state. If the prior role had an
  // unshared invite row, cancel it in the background so the orphan doesn't
  // hold a spot on the team. Shared invites are left alone — the user may
  // already have texted the link.
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
      const r = await createPartnerInvite({ ownerId, role, label });
      setUrl(r.url);
      setCode(r.inviteCode);
      setStatus("ready");
      return { url: r.url, code: r.inviteCode };
    } catch (err) {
      setErrorText(describePartnerError(err, CREATE_FAILED));
      setStatus("error");
      return null;
    } finally {
      creatingRef.current = false;
    }
  }

  function markShared(inviteCode: string) {
    setStatus("shared");
    onSent?.(inviteCode);
  }

  async function handleShare() {
    const inv = await ensureInvite();
    if (!inv) return;
    const ok = await shareInvite({ url: inv.url, babyName, role });
    if (ok) markShared(inv.code);
  }

  async function handleCopy() {
    const inv = await ensureInvite();
    if (!inv) return;
    try {
      await copyInviteUrl(inv.url);
      toast({ title: "Link copied" });
      markShared(inv.code);
    } catch (err) {
      console.error("copy invite link failed", err);
      toast({
        title: "Couldn't copy the link",
        description: "Try Text it or Show QR instead.",
        variant: "destructive",
      });
    }
  }

  async function handleShowQr() {
    const inv = await ensureInvite();
    if (!inv) return;
    setShowQr(true);
    markShared(inv.code);
  }

  const busy = status === "creating";

  if (status === "error") {
    return (
      <div className="space-y-3 py-4">
        <p className="text-sm text-foreground">{errorText ?? CREATE_FAILED}</p>
        <Button
          className="w-full touch-target"
          onClick={() => {
            setErrorText(null);
            setStatus("idle");
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (showQr && url) {
    return <QrPanel url={url} onBack={() => setShowQr(false)} />;
  }

  return (
    <div className="space-y-3">
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
        className="w-full min-h-[48px] flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left disabled:opacity-50"
      >
        <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-xs font-mono text-muted-foreground truncate">
          {url ?? "Copy invite link"}
        </span>
        <span className="text-sm font-semibold text-primary">
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
        variant={status === "shared" ? "default" : "outline"}
        className="w-full touch-target"
        onClick={onDone}
      >
        {status === "shared" ? "Done" : "I'll send this later"}
      </Button>
    </div>
  );
}

interface SheetProps extends Omit<BodyProps, "onDone"> {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InviteShareSheet({ open, onOpenChange, ...body }: SheetProps) {
  const copy = ROLE_COPY[body.role];
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display">Invite as {copy.title.toLowerCase()}</DrawerTitle>
          <DrawerDescription>
            They'll create their own account and start tracking {body.babyName} with you.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <InviteShareBody {...body} onDone={() => onOpenChange(false)} />
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
        <div className="text-xs opacity-70">{sub}</div>
      </span>
    </button>
  );
}

// The invite URL is a bearer credential, so the QR is drawn on-device rather
// than fetched from a third-party image service.
export function QrPanel({ url, onBack }: { url: string; onBack: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch((err) => {
        console.error("QR render failed", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {failed ? (
        <p className="text-sm text-muted-foreground py-8">
          The QR code didn't load. Go back and use Text it or Copy instead.
        </p>
      ) : dataUrl ? (
        <img
          src={dataUrl}
          alt="Invite QR code"
          width={240}
          height={240}
          className="rounded-2xl border border-border bg-background p-2"
        />
      ) : (
        <div className="w-[240px] h-[240px] rounded-2xl border border-border bg-muted animate-pulse" />
      )}
      <p className="text-xs text-muted-foreground max-w-[260px]">
        Have them open the camera and point at this code.
      </p>
      <Button variant="ghost" onClick={onBack} className="text-sm touch-target">
        Back to other options
      </Button>
    </div>
  );
}
