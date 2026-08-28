import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Users, CheckCircle, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { ROLE_COPY, describePartnerError, type PartnerRole } from "@/lib/partnerInvite";

export default function AcceptInvite() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "accepted" | "error" | "expired" | "self">("loading");
  const [invite, setInvite] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Store invite code in localStorage so it survives a cold-start deep link
      // (sessionStorage is wiped when the WebView is created fresh from a deep link)
      localStorage.setItem("pending_invite", code ?? "");
      navigate("/auth");
      return;
    }
    loadInvite();
  }, [user, authLoading, code]);

  const loadInvite = async () => {
    if (!code) { setStatus("error"); return; }

    // Use secure RPC to look up invite without exposing all invitation data
    const { data, error } = await supabase.rpc("lookup_partner_invitation", {
      _invite_code: code,
    });

    if (error || !data) { setStatus("error"); return; }

    const invite = data as {
      id: string;
      owner_id: string;
      status: string;
      expires_at: string;
      role?: PartnerRole;
      invitee_label?: string | null;
    };

    if (invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
      setStatus("expired");
      return;
    }

    if (invite.owner_id === user?.id) {
      setStatus("self");
      return;
    }

    setInvite(invite);
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
      // Seat-limit and lapsed-subscription rejections come back from the RPC
      // with machine-readable prefixes — the invitee should see why, not a
      // generic failure.
      const message = describePartnerError(err, "Failed to accept invite");
      setErrorMessage(message);
      toast({ title: message, variant: "destructive" });
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
              {invite?.role && ROLE_COPY[invite.role as PartnerRole] ? (
                <p className="text-sm">
                  You've been invited as a <b>{ROLE_COPY[invite.role as PartnerRole].title.toLowerCase()}</b>.{" "}
                  {ROLE_COPY[invite.role as PartnerRole].desc}
                </p>
              ) : (
                <p className="text-sm">
                  You've been invited to share access to a baby tracking account. Accept to view and log data together.
                </p>
              )}

              <div className="rounded-lg border border-border bg-muted/40 p-3 text-left space-y-2">
                <div className="flex items-center gap-2 text-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <p className="text-xs font-medium">What you'll have access to</p>
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4 leading-relaxed">
                  <li>The child's name, date of birth, photo, and prematurity status.</li>
                  <li>All sleep, feeding, diaper, allergen, milestone, illness, medication, and supplement records the family logs.</li>
                  <li>AI-generated briefings, weekly insights, and suggestions that use the child's data.</li>
                </ul>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  By accepting, you become a co-controller of this child's data alongside the inviting parent.
                  We do not sell or share data for advertising. Full details:{" "}
                  <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>
                  {" · "}
                  <Link to="/subprocessors" target="_blank" className="text-primary underline">Subprocessors</Link>
                  .
                </p>
              </div>

              <div className="flex items-start gap-2.5 text-left">
                <Checkbox
                  id="partnerConsent"
                  checked={consentAcknowledged}
                  onCheckedChange={(checked) => setConsentAcknowledged(checked === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="partnerConsent"
                  className="text-xs text-muted-foreground font-normal leading-snug cursor-pointer"
                >
                  I confirm I am a parent, legal guardian, or invited caregiver of this child, and I agree to the{" "}
                  <Link to="/terms" target="_blank" className="text-primary underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>.
                </Label>
              </div>

              <Button
                onClick={acceptInvite}
                disabled={accepting || !consentAcknowledged}
                className="w-full gap-2"
              >
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
              <p className="text-sm">{errorMessage ?? "Invalid or expired invite link."}</p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
