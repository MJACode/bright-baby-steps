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
import { Globe, Stethoscope } from "lucide-react";

type View = "login" | "signup" | "forgot" | "pending";

export default function ProAuth() {
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
        // Same PKCE cross-browser caveat as the consumer Auth page: the email
        // is already confirmed even when this exchange fails on a different
        // browser — point the user at sign-in, not at a scary "expired" error.
        toast.success("Email confirmed! Please sign in below to continue.");
      }
      setVerifying(false);
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [agreedToProTerms, setAgreedToProTerms] = useState(false);
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
        options: { emailRedirectTo: `${window.location.origin}/pro/auth` },
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
    return <Navigate to="/pro/dashboard" replace />;
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
            emailRedirectTo: `${window.location.origin}/pro/auth`,
            data: {
              full_name: fullName,
              slp_credentials: credentials,
              slp_practice_name: practiceName,
            },
          },
        });
        if (error) throw error;
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
    signup: isGeoBlocked ? "Not yet in your region" : "Create your professional account",
    forgot: "Reset your password",
    pending: "Check your inbox",
  };

  const descriptions: Record<View, string> = {
    login: "Sign in to your Grace Flare Pro workspace",
    signup: isGeoBlocked
      ? "Grace Flare Pro is not currently available in the EEA or UK."
      : "AI drafting tools for licensed speech-language pathologists",
    forgot: "Enter your email and we'll send you a reset link.",
    pending: `We sent a confirmation link to ${email}. Click it to activate your account.`,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-6 h-6 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="font-display text-lg font-bold">Grace Flare</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
              Pro
            </span>
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
                Already have an account with this email?{" "}
                <button
                  onClick={() => setView("login")}
                  className="text-primary font-medium hover:underline"
                >
                  Log in instead
                </button>
              </p>
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
                  Grace Flare Pro is not currently offered in the European Economic Area or the
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
              <>
                <div className="space-y-2">
                  <Label htmlFor="pro-fullName">Full name</Label>
                  <Input
                    id="pro-fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pro-credentials">Credentials</Label>
                  <Input
                    id="pro-credentials"
                    value={credentials}
                    onChange={(e) => setCredentials(e.target.value)}
                    placeholder="MS, CCC-SLP"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pro-practice">Practice name (optional)</Label>
                  <Input
                    id="pro-practice"
                    value={practiceName}
                    onChange={(e) => setPracticeName(e.target.value)}
                    placeholder="Your clinic or practice"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="pro-email">Email</Label>
              <Input
                id="pro-email"
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
                  <Label htmlFor="pro-password">Password</Label>
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
                  id="pro-password"
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
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="pro-terms"
                  checked={agreedToProTerms}
                  onCheckedChange={(checked) => setAgreedToProTerms(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="pro-terms" className="text-xs text-muted-foreground font-normal leading-snug cursor-pointer">
                  I agree to the{" "}
                  <Link to="/pro/terms" target="_blank" className="text-primary underline">
                    Grace Flare Pro Terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" target="_blank" className="text-primary underline">
                    Privacy Policy
                  </Link>
                  , and confirm I am a licensed speech-language pathologist or supervised clinician.
                </Label>
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || (view === "signup" && !agreedToProTerms)}
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
                New to Grace Flare Pro?{" "}
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
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Looking for the parent app?{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Go to Grace Flare
            </Link>
          </p>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
