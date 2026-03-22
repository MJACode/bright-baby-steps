import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Users, Copy, UserMinus, Link2, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function PartnerManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Fetch active partners (where I'm the owner)
  const { data: partners = [] } = useQuery({
    queryKey: ["partner_access", "owned"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("*, partner:partner_id(email)")
        .eq("owner_id", user!.id)
        .eq("status", "active");
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
      const link = `${window.location.origin}/invite/${data.invite_code}`;
      setInviteLink(link);
      queryClient.invalidateQueries({ queryKey: ["partner_invitations"] });
      toast({ title: "Invite link created!" });
    },
    onError: () => toast({ title: "Failed to create invite", variant: "destructive" }),
  });

  const revokePartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from("partner_access")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("owner_id", user!.id)
        .eq("partner_id", partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_access"] });
      toast({ title: "Partner removed" });
    },
  });

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast({ title: "Link copied to clipboard! 📋" });
    }
  };

  return (
    <Card className="border-0 bg-muted/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" /> Partner Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Invite your partner or caregiver to share access to your baby's data. They'll log in with their own account.
        </p>

        {/* Active partners */}
        {partners.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold">Active Partners</p>
            {partners.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm">{p.partner?.email ?? "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Added {format(new Date(p.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 text-xs gap-1"
                  onClick={() => revokePartner.mutate(p.partner_id)}
                >
                  <UserMinus className="w-3.5 h-3.5" /> Remove
                </Button>
              </div>
            ))}
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
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">
              {pendingInvites.length} pending invite(s)
            </p>
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

        {/* Generate invite button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => generateInvite.mutate()}
          disabled={generateInvite.isPending}
        >
          {generateInvite.isPending ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )}
          Generate Invite Link
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Links expire after 7 days. You can remove a partner at any time.
        </p>
      </CardContent>
    </Card>
  );
}
