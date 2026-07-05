import { useEffect, useState } from "react";
import { useInviteWatcher } from "@/hooks/useInviteWatcher";
import { Button } from "@/components/ui/button";
import { Check, Bell, Loader2 } from "lucide-react";
import { ROLE_COPY, type PartnerRole, shareInvite } from "@/lib/partnerInvite";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Props {
  inviteCode: string;
  role: PartnerRole;
  babyName: string;
  inviteeName?: string;
  onContinue: () => void;
}

export function LivePairingScreen({
  inviteCode, role, babyName, inviteeName, onContinue,
}: Props) {
  const { status, acceptedBy } = useInviteWatcher(inviteCode);
  const { user } = useAuth();
  const [acceptedEmail, setAcceptedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "accepted" || !acceptedBy) return;
    (async () => {
      const { data } = await supabase
        .from("partner_access")
        .select("partner:partner_id(email)")
        .eq("owner_id", user?.id ?? "")
        .eq("partner_id", acceptedBy)
        .maybeSingle();
      // @ts-expect-error — Supabase joined-row type
      setAcceptedEmail(data?.partner?.email ?? null);
    })();
  }, [status, acceptedBy, user?.id]);

  if (status === "accepted") {
    return (
      <ConnectedState
        babyName={babyName}
        partnerLabel={inviteeName ?? acceptedEmail?.split("@")[0] ?? "Your partner"}
        onContinue={onContinue}
      />
    );
  }

  return (
    <WaitingState
      role={role} babyName={babyName} inviteeName={inviteeName}
      onContinue={onContinue} isExpired={status === "expired"}
      inviteUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inviteCode}`}
    />
  );
}

function WaitingState({
  role, babyName, inviteeName, onContinue, isExpired, inviteUrl,
}: {
  role: PartnerRole;
  babyName: string;
  inviteeName?: string;
  onContinue: () => void;
  isExpired: boolean;
  inviteUrl: string;
}) {
  const copy = ROLE_COPY[role];
  const target = inviteeName ?? "your partner";
  const [resending, setResending] = useState(false);

  async function nudge() {
    setResending(true);
    await shareInvite({ url: inviteUrl, babyName, role });
    setTimeout(() => setResending(false), 1200);
  }

  return (
    <div className="flex flex-col flex-1 px-6 pt-8 pb-8 max-w-sm mx-auto">
      <div className="text-center mb-8">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          {isExpired ? "Invite expired" : "Waiting for them"}
        </p>
        <h2 className="font-display text-2xl font-bold leading-tight">
          You sent <span className="italic">{target}</span> a {copy.title.toLowerCase()} invite.
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {isExpired ? "Send a new one when you're ready." : "The moment they accept, you'll see it here."}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 gap-6">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping-slow" />
          <span className="absolute inset-3 rounded-full bg-primary/30 animate-ping-slower" />
          <div className="relative w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Listening for {target}…</p>
          <p className="text-xs text-muted-foreground mt-1">
            They'll appear here the second they tap Accept.
          </p>
        </div>
      </div>

      <div className="space-y-3 mt-8">
        <Button variant="outline" className="w-full gap-2" disabled={isExpired || resending} onClick={nudge}>
          <Bell className="w-4 h-4" /> {resending ? "Sending…" : "Send a nudge"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onContinue}>
          Skip — I'll wait on the dashboard
        </Button>
      </div>

      <style>{`
        @keyframes pingSlow {
          0%   { transform: scale(0.8); opacity: 0.6; }
          80%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .animate-ping-slow  { animation: pingSlow 2.4s ease-out infinite; }
        .animate-ping-slower{ animation: pingSlow 2.4s ease-out infinite 0.6s; }
      `}</style>
    </div>
  );
}

function ConnectedState({ babyName, partnerLabel, onContinue }: {
  babyName: string;
  partnerLabel: string;
  onContinue: () => void;
}) {
  const initials = (s: string) => s.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col flex-1 px-6 pt-8 pb-8 max-w-sm mx-auto relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 25%, hsl(var(--primary) / 0.15) 0%, transparent 60%)" }} />

      <div className="relative text-center pt-4 mb-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-primary mb-3 inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          Connected · live
        </p>
      </div>

      <div className="relative h-32 mb-2 flex items-center justify-center">
        <div className="absolute" style={{ left: "calc(50% - 96px)" }}>
          <AvatarBubble label="You" name="" tone="bg-orange-100 text-orange-900" />
        </div>
        <div className="absolute" style={{ left: "calc(50% + 8px)" }}>
          <AvatarBubble label={partnerLabel} name={initials(partnerLabel)} tone="bg-amber-100 text-amber-900" />
        </div>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M 38 50 Q 50 25, 62 50" stroke="hsl(var(--primary))" strokeWidth="0.5" strokeDasharray="2 2" fill="none" opacity="0.7" />
        </svg>
      </div>

      <h2 className="font-display text-3xl font-bold leading-tight text-center mt-4">
        You're both <span className="italic">tracking {babyName}.</span>
      </h2>
      <p className="text-sm text-muted-foreground text-center mt-3 px-4">
        Whatever either of you logs shows up on the other phone in seconds.
      </p>

      <div className={cn(
        "mt-8 rounded-2xl border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-700"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center text-[11px] font-semibold">
            {initials(partnerLabel)}
          </div>
          <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">
            {partnerLabel} · just now
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Check className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-sm">
            <div className="font-semibold">Joined {babyName}'s family</div>
            <div className="text-xs text-muted-foreground">
              They'll see your logs and can add their own.
            </div>
          </div>
        </div>
      </div>

      <Button className="w-full mt-auto" onClick={onContinue}>Let's go to today</Button>
    </div>
  );
}

function AvatarBubble({ name, label, tone }: { name: string; label: string; tone: string }) {
  return (
    <div className="text-center">
      <div className={cn("w-20 h-20 rounded-full flex items-center justify-center font-display text-3xl border-2 border-background shadow-sm", tone)}>
        {name || "·"}
      </div>
      <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider mt-2">{label}</p>
    </div>
  );
}
