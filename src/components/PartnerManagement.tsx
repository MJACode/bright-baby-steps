import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { APP_URL } from "@/lib/appUrl";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePremium } from "@/hooks/usePremium";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import { toast } from "@/hooks/use-toast";
import { Users, Copy, UserMinus, Link2, RefreshCw, X, Sparkles, PauseCircle } from "lucide-react";
import {
  ROLE_COPY,
  MAX_ADDITIONAL_USERS,
  seatSummary,
  describePartnerError,
  type PartnerRole,
} from "@/lib/partnerInvite";
import { format } from "date-fns";

export default function PartnerManagement() {
  const { user } = useAuth();
  const { isPremium, isLoading: premiumLoading } = usePremium();
  const queryClient = useQueryClient();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Fetch the people who hold a seat on this account. Paused rows come back
  // too — a paused partner still occupies a seat, and the owner needs the
  // toggle to bring them back.
  const { data: partners = [] } = useQuery({
    queryKey: ["partner_access", "owned"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("*, partner:partner_id(email)")
        .eq("owner_id", user!.id)
        .in("status", ["active", "paused"]);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  // Fetch who I'm a partner of
  const { data: partnerOf = [] } = useQuery({
    queryKey: ["partner_access", "partner_of"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("*, owner:owner_id(email)")
        .eq("partner_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  // Fetch pending invitations
  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["partner_invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_invitations")
        .select("*")
        .eq("owner_id", user!.id)
        .eq("status", "pending")
        .gte("expires_at", new Date().toISOString());
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const seats = seatSummary({
    isPremium,
    partnerCount: partners.length,
    pendingInviteCount: pendingInvites.length,
  });

  const generateInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("partner_invitations")
        .insert({ owner_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const link = `${APP_URL}/invite/${data.invite_code}`;
      setInviteLink(link);
      queryClient.invalidateQueries({ queryKey: ["partner_invitations"] });
      toast({ title: "Invite link created!" });
    },
    onError: (err) =>
      toast({
        title: describePartnerError(err, "Failed to create invite"),
        variant: "destructive",
      }),
  });

  const setPaused = useMutation({
    mutationFn: async ({ partnerId, paused }: { partnerId: string; paused: boolean }) => {
      const { error } = await supabase.rpc("set_partner_access_paused", {
        _partner_id: partnerId,
        _paused: paused,
      });
      if (error) throw error;
      return paused;
    },
    onSuccess: (paused) => {
      queryClient.invalidateQueries({ queryKey: ["partner_access"] });
      toast({
        title: paused ? "Access paused" : "Access restored",
        description: paused
          ? "They can't see or log anything until you switch it back on."
          : "They're back in — same role, same access as before.",
      });
    },
    onError: (err) =>
      toast({
        title: describePartnerError(err, "Couldn't update access"),
        variant: "destructive",
      }),
  });

  const revokePartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from("partner_access")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), paused_at: null })
        .eq("owner_id", user!.id)
        .eq("partner_id", partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_access"] });
      toast({ title: "Partner removed", description: "Their seat is free for someone else." });
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from("partner_invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId)
        .eq("owner_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_invitations"] });
      toast({ title: "Invite cancelled" });
    },
  });

  const copyText = async (text: string) => {
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast({ title: "Link copied to clipboard! 📋" });
  };

  const copyLink = async () => {
    if (inviteLink) await copyText(inviteLink);
  };

  // Someone whose Flare+ lapsed keeps their people listed but they can't see
  // anything until the subscription is back. Say so plainly — this is the one
  // place they can find out why their partner stopped getting updates.
  const showLapsedBanner = !premiumLoading && !isPremium && partners.length > 0;

  return (
    <Card className="border-0 bg-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" /> Partner Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Invite your partner or caregiver to share access to your baby's data. They'll log in with
          their own account.
        </p>

        {isPremium && (
          <p className="text-[11px] font-semibold text-muted-foreground">
            {seats.used} of {seats.limit} Flare+ seats used
          </p>
        )}

        {showLapsedBanner && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">Shared access is on hold</p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              Partner access is part of Flare+. Everyone below is saved exactly as they were —
              restart Flare+ and they're back in instantly.
            </p>
            <Button size="sm" className="mt-2 h-8 rounded-full text-xs" onClick={() => setUpgradeOpen(true)}>
              Restart Flare+
            </Button>
          </div>
        )}

        {/* People on this account */}
        {partners.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold">On your account</p>
            {partners.map((p: any) => {
              const paused = p.status === "paused";
              return (
                <div key={p.id} className="bg-background rounded-lg px-3 py-2 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm flex items-center gap-2 flex-wrap">
                        <span className="truncate">{p.partner?.email ?? "Unknown"}</span>
                        <span className="text-[10px] font-mono uppercase text-muted-foreground">
                          {p.role ?? "coparent"}
                        </span>
                        {paused && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-warning">
                            <PauseCircle className="w-3 h-3" /> Paused
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Added {format(new Date(p.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7 text-xs gap-1 shrink-0"
                      onClick={() => revokePartner.mutate(p.partner_id)}
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Remove
                    </Button>
                  </div>
                  <label className="flex items-center justify-between gap-3 border-t border-border pt-2 cursor-pointer">
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {paused
                        ? "Switch on to give them access again."
                        : "Switch off to pause their access — you can turn it back on anytime."}
                    </span>
                    <Switch
                      checked={!paused}
                      disabled={setPaused.isPending}
                      onCheckedChange={(checked) =>
                        setPaused.mutate({ partnerId: p.partner_id, paused: !checked })
                      }
                      aria-label={`${paused ? "Restore" : "Pause"} access for ${p.partner?.email ?? "this partner"}`}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {/* Partner of (read-only) */}
        {partnerOf.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold">You're a partner on</p>
            {partnerOf.map((p: any) => (
              <div key={p.id} className="bg-background rounded-lg px-3 py-2">
                <p className="text-sm">{p.owner?.email ?? "Unknown"}'s account</p>
              </div>
            ))}
          </div>
        )}

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold">Pending invites</p>
            {pendingInvites.map((inv) => {
              const url = `${APP_URL}/invite/${inv.invite_code}`;
              const role = inv.role as PartnerRole;
              return (
                <div key={inv.id} className="bg-background rounded-lg px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ROLE_COPY[role].title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Expires {format(new Date(inv.expires_at), "MMM d")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7 text-xs gap-1"
                      onClick={() => cancelInvite.mutate(inv.id)}
                      disabled={cancelInvite.isPending}
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
                    <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-[11px] truncate flex-1 font-mono">{url}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => copyText(url)}
                      aria-label="Copy invite link"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Invite link display */}
        {inviteLink && (
          <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
            <Link2 className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs truncate flex-1 font-mono">{inviteLink}</p>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLink}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Invite CTA — teaser on free tier, real button on Flare+ */}
        {premiumLoading ? null : !isPremium ? (
          <button
            onClick={() => setUpgradeOpen(true)}
            className="w-full text-left rounded-2xl border border-primary/20 bg-primary/5 p-4 active:scale-[0.99] transition-transform min-h-[48px]"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wide text-primary">
                Add up to {MAX_ADDITIONAL_USERS} people
              </span>
            </div>
            <p className="text-sm text-foreground/80 leading-snug">
              Flare+ brings your partner, sitter, or grandparent onto the account — same logs, live
              sync, and you can pause anyone at any time.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
              Try free for 7 days <span aria-hidden>→</span>
            </div>
          </button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => generateInvite.mutate()}
              disabled={generateInvite.isPending || !seats.canInvite}
            >
              {generateInvite.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              Generate Invite Link
            </Button>
            <p className="text-[10px] text-muted-foreground">
              {seats.canInvite
                ? "Links expire after 7 days. You can pause or remove anyone at any time."
                : `All ${seats.limit} seats are in use. Remove someone — or cancel a pending invite — to free one up.`}
            </p>
          </>
        )}
      </CardContent>

      <UpgradeSheet open={upgradeOpen} onOpenChange={setUpgradeOpen} feature="multi-caregiver" />
    </Card>
  );
}
