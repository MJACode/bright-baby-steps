import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Baby } from "lucide-react";

type View = "login" | "signup" | "forgot";

export default function Auth() {
  const { session, loading } = useAuth();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
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
            emailRedirectTo: window.location.origin,
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
        toast.success("Check your email to confirm your account!");
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

  const titles: Record<View, string> = {
    login: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
  };

  const descriptions: Record<View, string> = {
    login: "Sign in to access your baby tracking dashboard",
    signup: "Start tracking your baby's growth and speech development",
    forgot: "Enter your email and we'll send you a reset link.",
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
                    <li>Baby Steps is <strong className="text-foreground/70">not a medical service</strong>. AI responses are informational only — always consult your child's doctor for medical questions.</li>
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
        </CardContent>
      </Card>
    </div>
  );
}
