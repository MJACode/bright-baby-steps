import { useState, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeoBlock } from "@/hooks/useGeoBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Baby, Globe } from "lucide-react";

type View = "login" | "signup" | "forgot" | "pending";

export default function Auth() {
  const { session, loading } = useAuth();
  const geo = useGeoBlock();
  const [view, setView] = useState<View>("login");
  const [verifying, setVerifying] = useState(
    () => !!new URLSearchParams(window.location.search).get("code")
  );

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        // Supabase's /verify endpoint already flipped email_confirmed_at before
        // redirecting here, so the email is confirmed even when this exchange
        // fails. The common cause is the link being opened on a different
        // browser than the one that initiated signup (e.g. Gmail's in-app
        // browser): PKCE's code_verifier lives in localStorage on the original
        // device, so the exchange can't complete on the opener. Telling the
        // user the link "expired" is wrong and scary — point them at sign-in.
        toast.success("Email confirmed! Please sign in below to continue.");
      }
      setVerifying(false);
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (view !== "pending") return;
    setResendCooldown(60);
  }, [view]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) {
        if (error.message.toLowerCase().includes("rate limit")) {
          toast.error("Too many emails sent — please wait a few minutes before trying again.");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Confirmation email resent! Check your inbox.");
        setResendCooldown(60);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  };

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">
          {verifying ? "Verifying your email…" : "Loading..."}
        </div>
      </div>
    );
  }

  if (session) {
    const pendingInvite = sessionStorage.getItem("pending_invite");
    if (pendingInvite) {
      sessionStorage.removeItem("pending_invite");
      return <Navigate to={`/invite/${pendingInvite}`} replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (view === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      } else if (view === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (signUpData.user) {
          await supabase.from("profiles").update({
            data_consent_given_at: new Date().toISOString(),
            data_consent_version: "1.0",
          }).eq("id", signUpData.user.id);
        }
        // First half of COPPA email-plus VPC. Requires Supabase Auth's "Confirm
        // email" setting to be ON; when it is, signUpData.session is null and we
        // flip to the "pending" view. The auth.users trigger
        // sync_email_confirmation_to_vpc mirrors email_confirmed_at into
        // profiles.vpc_first_confirmation_at when the parent clicks the link.
        if (!signUpData.session) {
          setView("pending");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a password reset link.");
        setView("login");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const isGeoBlocked = view === "signup" && geo.blocked;

  const titles: Record<View, string> = {
    login: "Welcome back",
    signup: isGeoBlocked ? "Not yet in your region" : "Create your account",
    forgot: "Reset your password",
    pending: "Check your inbox",
  };

  const descriptions: Record<View, string> = {
    login: "Sign in to access your baby tracking dashboard",
    signup: isGeoBlocked
      ? "Grace Flare is not currently available in the EEA or UK."
      : "Start tracking your baby's growth and speech development",
    forgot: "Enter your email and we'll send you a reset link.",
    pending: `We sent a confirmation link to ${email}. Click it to activate your account.`,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Baby className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">{titles[view]}</CardTitle>
          <CardDescription>{descriptions[view]}</CardDescription>
        </CardHeader>
        <CardContent>
          {view === "pending" ? (
            <div className="text-center space-y-4">
              {resendCooldown > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Didn't get it? You can resend in{" "}
                  <span className="tabular-nums font-medium text-foreground">{resendCooldown}s</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Didn't get it?{" "}
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    className="text-primary font-medium hover:underline disabled:opacity-50"
                  >
                    {resending ? "Sending…" : "Send again"}
                  </button>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Wrong email?{" "}
                <button
                  onClick={() => setView("signup")}
                  className="text-primary font-medium hover:underline"
                >
                  Start over
                </button>
              </p>
            </div>
          ) : view === "signup" && geo.blocked ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Not yet available in your region</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Grace Flare is not currently offered in the European Economic Area or the
                  United Kingdom. We're working on it. In the meantime,{" "}
                  <a href="mailto:support@graceflare.com" className="text-primary underline">
                    let us know
                  </a>{" "}
                  if you'd like to be notified when we launch in your country.
                </p>
              </div>
              <button
                onClick={() => setView("login")}
                className="text-xs text-primary font-medium hover:underline"
              >
                Already have an account? Sign in
              </button>
            </div>
          ) : view === "signup" && geo.loading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="animate-pulse text-xs text-muted-foreground">Checking availability…</div>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {view === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            {view !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {view === "login" && (
                    <button
                      type="button"
                      onClick={() => setView("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
                {view === "signup" && (
                  <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
                )}
              </div>
            )}
            {view === "signup" && (
              <>
                <div className="rounded-lg bg-muted/50 border p-3 space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground/80">Before you create an account:</p>
                  <ul className="space-y-1 list-disc pl-4">
                    <li>Grace Flare is <strong className="text-foreground/70">not a medical service</strong>. AI responses are informational only — always consult your child's doctor for medical questions.</li>
                    <li>Your child's name, age, and activity logs are sent to our <strong className="text-foreground/70">AI provider</strong> to generate insights and chat responses. Your data is never used to train AI models.</li>
                    <li>You must be the <strong className="text-foreground/70">parent or legal guardian</strong> of any child whose data you add (required under COPPA).</li>
                    <li>You can <strong className="text-foreground/70">export or delete</strong> all your data at any time from your profile.</li>
                  </ul>
                </div>
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="terms" className="text-xs text-muted-foreground font-normal leading-snug cursor-pointer">
                    I agree to the{" "}
                    <Link to="/terms" target="_blank" className="text-primary underline">Terms of Service</Link>
                    {" "}and{" "}
                    <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>
                    , and confirm I am the parent or legal guardian of any child whose data I add.
                  </Label>
                </div>
              </>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || (view === "signup" && !agreedToTerms)}
            >
              {submitting
                ? "Please wait..."
                : view === "login"
                ? "Sign In"
                : view === "signup"
                ? "Create Account"
                : "Send Reset Link"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {view === "forgot" ? (
              <>
                Remembered it?{" "}
                <button
                  onClick={() => setView("login")}
                  className="text-primary font-medium hover:underline"
                >
                  Back to sign in
                </button>
              </>
            ) : view === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  onClick={() => setView("signup")}
                  className="text-primary font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setView("login")}
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
