import { useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ShieldCheck, AlertTriangle } from "lucide-react";

const APPROVE_URL =
  "https://ieuznbvvwdvhtirzwkly.supabase.co/functions/v1/mcp/oauth/approve";

// Must stay in sync with the MCP server's read scope (CHILD_DATA_TOOLS in
// supabase/functions/_shared/childDataTools.ts) — a mismatch is a § 5
// misrepresentation. "Profile" covers get_child_profile / list_accessible_children.
const READ_ONLY_CATEGORIES = [
  "Profile",
  "Sleep",
  "Feeds",
  "Diapers",
  "Growth",
  "Milestones",
  "Illnesses",
  "Vaccinations",
  "Allergens",
];

export default function McpConsentPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const { children } = useChildren();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!session) {
    // Preserve the full consent deep link (all OAuth query params) so Auth
    // returns the user to this exact URL after they sign in. localStorage (not
    // sessionStorage) so it survives a Capacitor WebView cold-start — Claude
    // hands the user an external deep link, exactly the case the pending_invite
    // pattern uses localStorage for.
    try {
      localStorage.setItem("post_login_redirect", location.pathname + location.search);
    } catch {}
    return <Navigate to="/auth" replace />;
  }

  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const state = params.get("state");
  const scope = params.get("scope");
  const resource = params.get("resource");

  const missingRequired = !clientId || !redirectUri;

  const childNames = children.map((c) => c.name).filter(Boolean);
  const childLabel =
    childNames.length === 0
      ? "your baby's data"
      : childNames.length === 1
      ? childNames[0]
      : childNames.slice(0, -1).join(", ") + " and " + childNames[childNames.length - 1];

  const handleApprove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Your session expired. Please sign in again and retry the connection.");
        setSubmitting(false);
        return;
      }
      const res = await fetch(APPROVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          state,
          scope,
          resource,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const description =
          payload?.error_description ||
          "We couldn't complete the connection. Close this window and try adding the connector in Claude again.";
        setError(description);
        setSubmitting(false);
        return;
      }
      const { redirect } = await res.json();
      window.location.href = redirect;
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't reach Grace Flare. Check your connection and try again.";
      setError(message);
      setSubmitting(false);
    }
  };

  // Only bounce back to the client's redirect_uri if it's a sane web scheme.
  // The legitimate flow always arrives here via the backend's /oauth/authorize,
  // which has already validated redirect_uri against the registered client — but
  // this route is directly reachable, so guard against a crafted redirect_uri
  // (javascript:, data:, etc.) being used as a one-click open-redirect on deny.
  const isSafeWebRedirect = (uri: string): boolean => {
    try {
      const u = new URL(uri);
      return (
        u.protocol === "https:" ||
        (u.protocol === "http:" &&
          (u.hostname === "localhost" || u.hostname === "127.0.0.1"))
      );
    } catch {
      return false;
    }
  };

  const handleDeny = () => {
    if (redirectUri && isSafeWebRedirect(redirectUri)) {
      const denyUrl =
        redirectUri + "?error=access_denied" + (state ? "&state=" + encodeURIComponent(state) : "");
      window.location.href = denyUrl;
      return;
    }
    // No safe redirect target — don't open-redirect; show an in-page cancelled state.
    setCancelled(true);
  };

  if (cancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-muted rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle className="font-display text-2xl">Connection cancelled</CardTitle>
            <CardDescription>
              No access was granted. You can close this tab and return to Claude.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (missingRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle className="font-display text-2xl">This link is incomplete</CardTitle>
            <CardDescription>
              We couldn't read the connection details from Claude. Start over by adding the
              Grace Flare connector in Claude again, then follow the sign-in link it gives you.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">Connect Claude to {childLabel}</CardTitle>
          <CardDescription>
            Claude is asking to read your baby's tracked data so it can answer your questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg bg-muted/50 border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Read-only access
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This connection is read-only — Claude cannot add, change, or delete your records through it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {READ_ONLY_CATEGORIES.map((cat) => (
                <span
                  key={cat}
                  className="text-[10px] font-semibold bg-background rounded-full px-2 py-1 text-foreground/80"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>

          {/* LEGAL: reviewed copy */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            When you approve, your child's data is sent to <strong>your own Claude</strong> and
            processed under <strong>Anthropic's</strong> terms for that Claude product. This is
            you sharing your data with your own AI tool — it is separate from Grace Flare's
            in-app AI features and from how Grace Flare itself uses Anthropic. Once your child's
            data is in your own Claude, Grace Flare can no longer control or delete it — it's kept
            and managed under your Claude account, not by us, so deleting data in Grace Flare won't
            remove copies already read into Claude. You can revoke this connection any time at
            Settings → Connect to Claude.
          </p>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
              <p className="text-xs text-destructive leading-relaxed">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Button
              className="w-full touch-target"
              onClick={handleApprove}
              disabled={submitting}
            >
              {submitting ? "Connecting…" : "Approve access"}
            </Button>
            <Button
              variant="outline"
              className="w-full touch-target"
              onClick={handleDeny}
              disabled={submitting}
            >
              Deny
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
