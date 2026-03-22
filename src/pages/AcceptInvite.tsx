import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Users, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function AcceptInvite() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "accepted" | "error" | "expired" | "self">("loading");
  const [invite, setInvite] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Store invite code and redirect to auth
      sessionStorage.setItem("pending_invite", code ?? "");
      navigate("/auth");
      return;
    }
    loadInvite();
  }, [user, authLoading, code]);

  const loadInvite = async () => {
    if (!code) { setStatus("error"); return; }

    const { data, error } = await supabase
      .from("partner_invitations")
      .select("*")
      .eq("invite_code", code)
      .single();

    if (error || !data) { setStatus("error"); return; }

    if (data.status !== "pending" || new Date(data.expires_at) < new Date()) {
      setStatus("expired");
      return;
    }

    if (data.owner_id === user?.id) {
      setStatus("self");
      return;
    }

    setInvite(data);
    setStatus("ready");
  };

  const acceptInvite = async () => {
    if (!invite || !user) return;
    setAccepting(true);

    try {
      // Use secure RPC to accept invitation atomically
      const { error } = await supabase.rpc("accept_partner_invitation", {
        _invite_code: code!,
      });

      if (error) throw error;

      setStatus("accepted");
      toast({ title: "You're now connected as a partner! 🎉" });
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to accept invite", variant: "destructive" });
      setStatus("error");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Partner Invite
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading invite...</p>
            </div>
          )}

          {status === "ready" && (
            <>
              <p className="text-sm">
                You've been invited to share access to a baby tracking account. Accept to view and log data together.
              </p>
              <Button onClick={acceptInvite} disabled={accepting} className="w-full gap-2">
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Accept Invite
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="w-full">
                Decline
              </Button>
            </>
          )}

          {status === "accepted" && (
            <div className="flex flex-col items-center gap-2 py-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-sm font-semibold">You're connected!</p>
              <p className="text-xs text-muted-foreground">Redirecting to dashboard...</p>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center gap-2 py-4">
              <XCircle className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm">This invite has expired or already been used.</p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </div>
          )}

          {status === "self" && (
            <div className="flex flex-col items-center gap-2 py-4">
              <XCircle className="w-12 h-12 text-muted-foreground" />
              <p className="text-sm">You can't accept your own invite.</p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-2 py-4">
              <XCircle className="w-12 h-12 text-destructive" />
              <p className="text-sm">Invalid or expired invite link.</p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
