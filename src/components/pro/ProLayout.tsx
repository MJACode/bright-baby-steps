import { useState } from "react";
import { Navigate, Outlet, Link } from "react-router-dom";
import { LogOut, BadgeCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSlpProfile, useCreateSlpProfile } from "@/hooks/pro/useSlpProfile";
import { useProEntitlement } from "@/hooks/pro/useProEntitlement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProLayout() {
  const { session, loading, signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useSlpProfile();
  const { isPro } = useProEntitlement();

  if (loading || (session && profileLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <img src="/app-icon.png" alt="Grace Flare Pro" className="w-12 h-12 rounded-xl animate-pulse" />
        <p className="text-muted-foreground font-medium">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/pro/auth" replace />;
  }

  return (
    // Same viewport-pinned shell as DashboardLayout: chrome as flex children,
    // <main> as the single scroll container (iOS WKWebView hit-testing).
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="shrink-0 z-40 bg-card/90 backdrop-blur-lg border-b border-border safe-area-top">
        <div className="flex items-center justify-between h-14 px-4 max-w-3xl mx-auto w-full">
          <Link to="/pro/dashboard" className="flex items-center gap-2 min-h-[48px]" aria-label="Grace Flare Pro home">
            <img src="/app-icon.png" alt="" className="w-7 h-7 rounded-md" />
            <span className="font-display text-base font-bold">Grace Flare</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider font-mono">
              Pro
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {isPro ? (
              <Link
                to="/pro/upgrade"
                className="inline-flex items-center gap-1 min-h-[48px] px-2 text-xs font-semibold text-primary"
              >
                <BadgeCheck className="w-4 h-4" />
                Pro active
              </Link>
            ) : (
              <Button asChild size="sm" variant="outline" className="min-h-[48px] rounded-xl font-semibold">
                <Link to="/pro/upgrade">Upgrade</Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="touch-target text-muted-foreground"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-6 max-w-3xl mx-auto w-full">
        {profile ? <Outlet /> : <ProOnboarding />}
      </main>
    </div>
  );
}

function ProOnboarding() {
  const { user } = useAuth();
  const createProfile = useCreateSlpProfile();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const [fullName, setFullName] = useState(typeof meta.full_name === "string" ? meta.full_name : "");
  const [credentials, setCredentials] = useState(
    typeof meta.slp_credentials === "string" ? meta.slp_credentials : ""
  );
  const [practiceName, setPracticeName] = useState(
    typeof meta.slp_practice_name === "string" ? meta.slp_practice_name : ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    createProfile.mutate({ fullName, credentials, practiceName });
  };

  return (
    <div className="max-w-md mx-auto pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl font-bold">Set up your professional profile</CardTitle>
          <CardDescription>
            Your name and credentials appear on the home programs you share with families.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pro-full-name">Full name</Label>
              <Input
                id="pro-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
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
            <Button
              type="submit"
              className="w-full min-h-[48px] rounded-xl font-bold"
              disabled={createProfile.isPending || !fullName.trim()}
            >
              {createProfile.isPending ? "Saving…" : "Continue"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              By continuing you agree to the{" "}
              <Link to="/pro/terms" target="_blank" className="text-primary underline">
                Grace Flare Pro Terms
              </Link>
              .
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
