// "Your team" — the people who can see and log for this family's children.
// The owner manages members (role, pause, remove) and invites here; a partner
// gets a read-only view of the team they belong to.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronRight, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { useMyTeamAccess, useTeam, type TeamInvite, type TeamMember } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { PartnerRolePicker, type SyncChoice } from "@/components/onboarding/PartnerRolePicker";
import { InviteShareBody, QrPanel } from "@/components/onboarding/InviteShareSheet";
import {
  PARTNER_ROLES,
  ROLE_COPY,
  describePartnerError,
  memberStatusText,
  shareInvite,
  spotsLine,
  type PartnerRole,
} from "@/lib/partnerInvite";
import { cn } from "@/lib/utils";

const shortDate = (iso: string) => format(new Date(iso), "MMM d");

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** "Lulu", "Lulu and Max", or "your children" — access is account-wide. */
function babiesLabel(names: string[]): string {
  if (names.length === 0) return "your baby";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return "your children";
}

export default function TeamPage() {
  const { user } = useAuth();
  const { children, activeChild } = useChildren();
  const ownerId = activeChild?.parent_id;
  const isOwner = !!user && (!activeChild || ownerId === user.id);

  const babies = useMemo(() => {
    if (!isOwner) return activeChild ? [activeChild.name.split(" ")[0]] : [];
    return children
      .filter((c) => c.parent_id === user?.id)
      .map((c) => c.name.split(" ")[0]);
  }, [children, activeChild, isOwner, user?.id]);
  const babyName = babiesLabel(babies);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Your team</h1>
        <p className="text-muted-foreground text-sm mt-1">
          People who can see and log for {babyName}.
        </p>
      </div>
      {isOwner ? (
        <OwnerTeam babyName={babyName} shareBabyName={babies[0] ?? "your baby"} />
      ) : (
        <PartnerTeam ownerId={ownerId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Owner view
// ---------------------------------------------------------------------------

type Selection =
  | { kind: "member"; id: string }
  | { kind: "invite"; id: string }
  | null;

type Confirm =
  | { kind: "coparent"; member: TeamMember }
  | { kind: "remove"; member: TeamMember }
  | { kind: "cancel-invite"; invite: TeamInvite }
  | null;

function OwnerTeam({ babyName, shareBabyName }: { babyName: string; shareBabyName: string }) {
  const team = useTeam();
  const { members, pending, expired, seats, isPremium, premiumLoading } = team;

  const [selection, setSelection] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [invite, setInvite] = useState<InviteDraft | null>(null);

  const selectedMember =
    selection?.kind === "member" ? members.find((m) => m.id === selection.id) ?? null : null;
  const selectedInvite =
    selection?.kind === "invite"
      ? [...pending, ...expired].find((i) => i.id === selection.id) ?? null
      : null;

  const onHold = members.filter((m) => m.onHold);
  const kept = members.find((m) => !m.onHold && m.status === "active") ?? null;

  const openItem = (s: NonNullable<Selection>) => {
    setSelection(s);
    setDrawerOpen(true);
  };

  // Radix focus traps fight when a Drawer and an AlertDialog are both open, so
  // the confirm replaces the drawer; backing out of it returns to the drawer.
  const askConfirm = (c: NonNullable<Confirm>) => {
    setDrawerOpen(false);
    setConfirm(c);
  };
  const backToDrawer = () => {
    setConfirm(null);
    setDrawerOpen(true);
  };

  const applyRole = (member: TeamMember, role: PartnerRole, { undoable = true } = {}) => {
    const previous = member.role;
    team.setRole.mutate(
      { partnerId: member.partnerId, role },
      {
        onSuccess: () =>
          toast({
            title: `${member.name} is now ${role === "viewer" ? "view-only" : `a ${ROLE_COPY[role].title.toLowerCase()}`}`,
            action: undoable ? (
              <ToastAction
                altText={`Undo role change for ${member.name}`}
                className="touch-target"
                onClick={() => applyRole(member, previous, { undoable: false })}
              >
                Undo
              </ToastAction>
            ) : undefined,
          }),
        onError: (err) => {
          console.error("set_partner_role failed", err);
          toast({
            title: `Couldn't change ${member.name}'s role`,
            description: "Nothing changed — try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onPickRole = (member: TeamMember, role: PartnerRole) => {
    if (role === member.role) return;
    if (role === "coparent") {
      askConfirm({ kind: "coparent", member });
      return;
    }
    applyRole(member, role);
  };

  const onTogglePaused = (member: TeamMember, paused: boolean) => {
    team.setPaused.mutate(
      { partnerId: member.partnerId, paused },
      {
        onSuccess: () =>
          toast({
            title: paused ? "Access paused" : "Access restored",
            description: paused
              ? `${member.name} can't see or log anything until you switch it back on.`
              : `${member.name} is back in — same role, same access as before.`,
          }),
        onError: (err) => {
          console.error("set_partner_access_paused failed", err);
          toast({
            title: describePartnerError(err, `Couldn't update ${member.name}'s access`),
            description: "Nothing changed — try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onRemove = (member: TeamMember) => {
    setConfirm(null);
    setSelection(null);
    team.remove.mutate(member.partnerId, {
      onSuccess: () => toast({ title: `${member.name} removed`, description: "Their spot is free." }),
      onError: (err) => {
        console.error("remove partner failed", err);
        toast({
          title: `Couldn't remove ${member.name}`,
          description: "They still have access — try again.",
          variant: "destructive",
        });
      },
    });
  };

  const onCancelInvite = (inv: TeamInvite) => {
    setConfirm(null);
    setSelection(null);
    team.cancelInvite.mutate(inv.id, {
      onSuccess: () => toast({ title: "Invite cancelled", description: "The spot is free." }),
      onError: (err) => {
        console.error("cancel invite failed", err);
        toast({
          title: "Couldn't cancel the invite",
          description: "The link still works — try again.",
          variant: "destructive",
        });
      },
    });
  };

  const onDismissExpired = (inv: TeamInvite) => {
    setDrawerOpen(false);
    setSelection(null);
    team.cancelInvite.mutate(inv.id, {
      onError: (err) => {
        console.error("dismiss expired invite failed", err);
        toast({
          title: "Couldn't dismiss the invite",
          description: "Check your connection and try again.",
          variant: "destructive",
        });
      },
    });
  };

  const onResendNew = (inv: TeamInvite) => {
    setDrawerOpen(false);
    setSelection(null);
    setInvite({ step: "share", role: inv.role, label: inv.label ?? "", replaces: inv.id });
  };

  if (team.isError) {
    return (
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-6 space-y-3">
          <p className="text-sm font-semibold">Couldn't load your team</p>
          <p className="text-sm text-muted-foreground">Check your connection, then try again.</p>
          <Button variant="outline" className="touch-target" onClick={team.refetch}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (team.isLoading || premiumLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const isEmpty = members.length === 0 && pending.length === 0 && expired.length === 0;
  const anyOnHold = onHold.length > 0;

  return (
    <>
      <p className="text-sm font-semibold text-muted-foreground">
        {spotsLine({ isPremium, used: seats.used, limit: seats.limit, waiting: pending.length })}
      </p>

      {anyOnHold && (
        <LapseBanner held={onHold} kept={kept} onRestart={() => setUpgradeOpen(true)} />
      )}

      {isEmpty ? (
        <Card className="border-0 bg-muted/50">
          <CardContent className="p-6 space-y-2">
            <p className="font-display text-lg font-bold">Track together</p>
            <p className="text-sm text-muted-foreground">
              Invite a co-parent, grandparent, or sitter. They use their own account and see the
              same logs, live.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 bg-card overflow-hidden">
          <CardContent className="p-0 divide-y divide-border">
            <StaticRow name="You" line2="Owner" />
            {members.map((m) => (
              <MemberRow key={m.id} member={m} onOpen={() => openItem({ kind: "member", id: m.id })} />
            ))}
            {pending.map((i) => (
              <InviteRow key={i.id} invite={i} onOpen={() => openItem({ kind: "invite", id: i.id })} />
            ))}
            {expired.map((i) => (
              <InviteRow key={i.id} invite={i} onOpen={() => openItem({ kind: "invite", id: i.id })} />
            ))}
          </CardContent>
        </Card>
      )}

      {!isPremium && !anyOnHold && !seats.canInvite && (
        <Card className="border border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold">Add a second person with Flare+</p>
            <p className="text-sm text-muted-foreground">
              Bring in a grandparent or sitter too — Flare+ includes 2 spots.
            </p>
            <Button variant="outline" className="touch-target" onClick={() => setUpgradeOpen(true)}>
              See Flare+
            </Button>
          </CardContent>
        </Card>
      )}

      {isPremium && !seats.canInvite && (
        <p className="text-sm text-muted-foreground">
          Your team is full. To invite someone new, remove someone or cancel a waiting invite.
        </p>
      )}

      {/* In the flow, not sticky: <main> is the scroll container, and sticky
          descendants of it mis-hit-test on iOS WKWebView (see DashboardLayout). */}
      {seats.canInvite && (
        <Button
          size="lg"
          className="w-full touch-target gap-2"
          onClick={() => setInvite({ step: "who", role: null, label: "", replaces: null })}
        >
          <UserPlus className="w-4 h-4" />
          Invite someone
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Everyone uses their own account. You can pause or remove anyone at any time.
      </p>

      <Drawer
        open={drawerOpen && !!(selectedMember || selectedInvite)}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o && !confirm) setSelection(null);
        }}
      >
        <DrawerContent className="max-h-[90vh]">
          <div className="overflow-y-auto">
            {selectedMember && (
              <MemberDrawerBody
                member={selectedMember}
                rolePending={team.setRole.isPending}
                pausePending={team.setPaused.isPending}
                onPickRole={(r) => onPickRole(selectedMember, r)}
                onTogglePaused={(p) => onTogglePaused(selectedMember, p)}
                onRemove={() => askConfirm({ kind: "remove", member: selectedMember })}
              />
            )}
            {selectedInvite && (
              <InviteDrawerBody
                key={selectedInvite.id}
                invite={selectedInvite}
                babyName={shareBabyName}
                onCancel={() => askConfirm({ kind: "cancel-invite", invite: selectedInvite })}
                onResendNew={() => onResendNew(selectedInvite)}
                onDismiss={() => onDismissExpired(selectedInvite)}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <ConfirmDialogs
        confirm={confirm}
        babyName={babyName}
        onBack={backToDrawer}
        onConfirmCoparent={(m) => {
          setConfirm(null);
          setDrawerOpen(true);
          applyRole(m, "coparent");
        }}
        onConfirmRemove={onRemove}
        onConfirmCancelInvite={onCancelInvite}
      />

      {team.ownerId && (
        <InviteDrawer
          draft={invite}
          onDraftChange={setInvite}
          ownerId={team.ownerId}
          babyName={shareBabyName}
          onSent={(replaces) => {
            team.invalidate();
            if (replaces) {
              // onSent fires per share action (text, QR, copy); retire once.
              setInvite((d) => (d ? { ...d, replaces: null } : d));
              team.cancelInvite.mutate(replaces, {
                onError: (err) => console.error("retiring expired invite failed", err),
              });
            }
          }}
        />
      )}

      <UpgradeSheet open={upgradeOpen} onOpenChange={setUpgradeOpen} feature="multi-caregiver" />
    </>
  );
}

function LapseBanner({
  held, kept, onRestart,
}: { held: TeamMember[]; kept: TeamMember | null; onRestart: () => void }) {
  const names = held.map((m) => m.name).join(" and ");
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 space-y-2">
      <p className="text-sm font-semibold">Flare+ has ended — {names}'s access is on hold</p>
      <p className="text-sm text-muted-foreground">
        {kept ? `${kept.name} still has full access on the free plan. ` : ""}
        {names} is saved exactly as they were and comes back the moment you restart Flare+.
      </p>
      <Button className="touch-target" onClick={onRestart}>
        Restart Flare+
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function RowShell({
  circle, line1, line2, onClick, ariaLabel,
}: {
  circle: React.ReactNode;
  line1: string;
  line2: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      {circle}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">{line1}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{line2}</span>
      </span>
      {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />}
    </>
  );
  const cls = "w-full min-h-[64px] flex items-center gap-3 px-4 py-3 text-left";
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(cls, "touch-target hover:bg-muted/50 active:bg-muted transition-colors")}
    >
      {inner}
    </button>
  );
}

function InitialCircle({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0"
    >
      {initial(name)}
    </span>
  );
}

function StaticRow({ name, line2 }: { name: string; line2: string }) {
  return <RowShell circle={<InitialCircle name={name} />} line1={name} line2={line2} />;
}

function MemberRow({ member, onOpen }: { member: TeamMember; onOpen: () => void }) {
  const role = ROLE_COPY[member.role].title;
  const status = memberStatusText(member);
  return (
    <RowShell
      circle={<InitialCircle name={member.name} />}
      line1={member.name}
      line2={`${role} · ${status}`}
      onClick={onOpen}
      ariaLabel={`${member.name}, ${role}, ${status}. Opens options.`}
    />
  );
}

function InviteRow({ invite, onOpen }: { invite: TeamInvite; onOpen: () => void }) {
  const role = ROLE_COPY[invite.role].title;
  const line1 = `${invite.label ?? "Invite"} · ${role}`;
  const line2 = invite.expired
    ? "Link expired"
    : `Waiting to join · link works until ${shortDate(invite.expiresAt)}`;
  return (
    <RowShell
      circle={
        <span
          aria-hidden
          className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground/40 shrink-0"
        />
      }
      line1={line1}
      line2={line2}
      onClick={onOpen}
      ariaLabel={`${line1}, ${line2}. Opens options.`}
    />
  );
}

// ---------------------------------------------------------------------------
// Drawers
// ---------------------------------------------------------------------------

function MemberDrawerBody({
  member, rolePending, pausePending, onPickRole, onTogglePaused, onRemove,
}: {
  member: TeamMember;
  rolePending: boolean;
  pausePending: boolean;
  onPickRole: (r: PartnerRole) => void;
  onTogglePaused: (paused: boolean) => void;
  onRemove: () => void;
}) {
  const paused = member.status === "paused";
  return (
    <>
      <DrawerHeader className="text-left">
        <DrawerTitle className="font-display">{member.name}</DrawerTitle>
        <DrawerDescription>
          {ROLE_COPY[member.role].title} · {memberStatusText(member)}
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pb-6 space-y-6">
        <section className="space-y-2">
          <p className="text-sm font-semibold">What they can do</p>
          <RadioGroup
            value={member.role}
            onValueChange={(v) => onPickRole(v as PartnerRole)}
            disabled={rolePending}
            aria-label={`Role for ${member.name}`}
          >
            {PARTNER_ROLES.map((r) => {
              const id = `role-${member.id}-${r}`;
              return (
                <Label
                  key={r}
                  htmlFor={id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-4 py-3 min-h-[56px] leading-snug cursor-pointer touch-target",
                    member.role === r ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <RadioGroupItem id={id} value={r} className="mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">{ROLE_COPY[r].title}</span>
                    <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                      {ROLE_COPY[r].desc}
                    </span>
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold">Access</p>
          {member.onHold ? (
            <p className="text-sm text-muted-foreground">
              On hold while Flare+ is off. Restart Flare+ to bring {member.name} back.
            </p>
          ) : (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 min-h-[56px] cursor-pointer">
              <span className="text-sm text-muted-foreground">
                {paused
                  ? "Switch on to give them access again."
                  : "Switch off to pause their access — you can turn it back on anytime."}
              </span>
              <Switch
                checked={!paused}
                disabled={pausePending}
                onCheckedChange={(checked) => onTogglePaused(!checked)}
                aria-label={`${paused ? "Restore" : "Pause"} access for ${member.name}`}
              />
            </label>
          )}
        </section>

        <Button
          variant="ghost"
          className="w-full touch-target text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          Remove from team
        </Button>
      </div>
    </>
  );
}

function InviteDrawerBody({
  invite, babyName, onCancel, onResendNew, onDismiss,
}: {
  invite: TeamInvite;
  babyName: string;
  onCancel: () => void;
  onResendNew: () => void;
  onDismiss: () => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const role = ROLE_COPY[invite.role].title;

  const resend = async () => {
    try {
      await shareInvite({ url: invite.url, babyName, role: invite.role });
    } catch (err) {
      console.error("share invite failed", err);
      toast({
        title: "Couldn't open sharing",
        description: "Try Show QR instead, or check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DrawerHeader className="text-left">
        <DrawerTitle className="font-display">{invite.label ?? "Invite"}</DrawerTitle>
        <DrawerDescription>
          {role} ·{" "}
          {invite.expired
            ? "Link expired"
            : `Waiting to join · link works until ${shortDate(invite.expiresAt)}`}
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pb-6 space-y-2">
        {invite.expired ? (
          <>
            <Button className="w-full touch-target" onClick={onResendNew}>
              Send a new link
            </Button>
            <Button variant="ghost" className="w-full touch-target" onClick={onDismiss}>
              Dismiss
            </Button>
          </>
        ) : showQr ? (
          <QrPanel url={invite.url} onBack={() => setShowQr(false)} />
        ) : (
          <>
            <Button className="w-full touch-target" onClick={resend}>
              Send link again
            </Button>
            <Button variant="outline" className="w-full touch-target" onClick={() => setShowQr(true)}>
              Show QR
            </Button>
            <Button
              variant="ghost"
              className="w-full touch-target text-destructive hover:text-destructive"
              onClick={onCancel}
            >
              Cancel invite
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function ConfirmDialogs({
  confirm, babyName, onBack, onConfirmCoparent, onConfirmRemove, onConfirmCancelInvite,
}: {
  confirm: Confirm;
  babyName: string;
  onBack: () => void;
  onConfirmCoparent: (m: TeamMember) => void;
  onConfirmRemove: (m: TeamMember) => void;
  onConfirmCancelInvite: (i: TeamInvite) => void;
}) {
  let title = "";
  let body = "";
  let action = "";
  let cancel = "";
  let run = () => {};
  if (confirm?.kind === "coparent") {
    const m = confirm.member;
    title = `Make ${m.name} a co-parent?`;
    body = "Co-parents can see and change everything, including finance and settings.";
    action = "Make co-parent";
    cancel = "Not now";
    run = () => onConfirmCoparent(m);
  } else if (confirm?.kind === "remove") {
    const m = confirm.member;
    title = `Remove ${m.name}?`;
    body = `${m.name} loses access to ${babyName}'s logs right away. Everything they logged stays. To add them back later, you'll send a new invite. We won't notify them.`;
    action = "Remove";
    cancel = `Keep ${m.name}`;
    run = () => onConfirmRemove(m);
  } else if (confirm?.kind === "cancel-invite") {
    const i = confirm.invite;
    title = "Cancel this invite?";
    body = "The link will stop working and the spot frees up.";
    action = "Cancel invite";
    cancel = "Keep invite";
    run = () => onConfirmCancelInvite(i);
  }
  const destructive = confirm?.kind === "remove" || confirm?.kind === "cancel-invite";

  return (
    <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) onBack(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="touch-target">{cancel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "touch-target",
              destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            onClick={run}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Invite drawer: who -> share, in one sheet
// ---------------------------------------------------------------------------

interface InviteDraft {
  step: "who" | "share";
  role: PartnerRole | null;
  label: string;
  /** An expired invite this one replaces; retired once the new link is sent. */
  replaces: string | null;
}

function InviteDrawer({
  draft, onDraftChange, ownerId, babyName, onSent,
}: {
  draft: InviteDraft | null;
  onDraftChange: (d: InviteDraft | null) => void;
  ownerId: string;
  babyName: string;
  onSent: (replaces: string | null) => void;
}) {
  const close = () => onDraftChange(null);
  const choice: SyncChoice | null = draft?.role ? { kind: "invite", role: draft.role } : null;

  return (
    <Drawer open={!!draft} onOpenChange={(o) => { if (!o) close(); }}>
      <DrawerContent className="max-h-[90vh]">
        <div className="overflow-y-auto">
          {draft?.step === "share" && draft.role ? (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="font-display">
                  Invite as {ROLE_COPY[draft.role].title.toLowerCase()}
                </DrawerTitle>
                <DrawerDescription>
                  They'll create their own account and start tracking {babyName} with you.
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <InviteShareBody
                  ownerId={ownerId}
                  role={draft.role}
                  label={draft.label.trim() || undefined}
                  babyName={babyName}
                  onSent={() => onSent(draft.replaces)}
                  onDone={close}
                />
              </div>
            </>
          ) : draft ? (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="font-display">Who are you inviting?</DrawerTitle>
                <DrawerDescription>Pick what they can do. You can change it later.</DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-4">
                <PartnerRolePicker
                  value={choice}
                  showSkip={false}
                  onChange={(v) => {
                    if (v.kind === "invite") onDraftChange({ ...draft, role: v.role });
                  }}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="invitee-label" className="text-sm font-semibold">
                    What do you call them? (optional)
                  </Label>
                  <Input
                    id="invitee-label"
                    value={draft.label}
                    maxLength={40}
                    placeholder="Grandma, Lucia…"
                    className="min-h-[48px]"
                    onChange={(e) => onDraftChange({ ...draft, label: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full touch-target"
                  disabled={!draft.role}
                  onClick={() => onDraftChange({ ...draft, step: "share" })}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Partner (non-owner) view — read-only
// ---------------------------------------------------------------------------

function PartnerTeam({ ownerId }: { ownerId: string | undefined }) {
  const { access, ownerName, isLoading, isError, refetch } = useMyTeamAccess(ownerId);
  const owner = ownerName ?? "The account owner";

  if (isError) {
    return (
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-6 space-y-3">
          <p className="text-sm font-semibold">Couldn't load your team</p>
          <Button variant="outline" className="touch-target" onClick={refetch}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (isLoading) return <Skeleton className="h-36 w-full rounded-2xl" />;

  const role = (access?.role as PartnerRole | undefined) ?? null;

  return (
    <>
      <Card className="border-0 bg-card overflow-hidden">
        <CardContent className="p-0 divide-y divide-border">
          <StaticRow name={owner} line2="Owner" />
          {role && (
            <StaticRow name="You" line2={`${ROLE_COPY[role].title} · ${ROLE_COPY[role].desc}`} />
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Only {ownerName ?? "the account owner"} can change the team.
      </p>
    </>
  );
}
