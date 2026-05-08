import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status =
  | { kind: "loading" }
  | { kind: "success"; alreadyCompleted?: boolean }
  | { kind: "expired" }
  | { kind: "missing_first" }
  | { kind: "error"; message: string };

export default function VpcConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus({ kind: "error", message: "No confirmation token in the link." });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("complete_vpc_second_confirmation", {
        p_token: token,
      });

      if (cancelled) return;

      if (error) {
        setStatus({ kind: "error", message: error.message });
        return;
      }

      const result = data as { ok: boolean; already_completed?: boolean; error?: string } | null;

      if (!result) {
        setStatus({ kind: "error", message: "Empty response from server." });
        return;
      }

      if (result.ok) {
        setStatus({ kind: "success", alreadyCompleted: result.already_completed });
        return;
      }

      switch (result.error) {
        case "invalid_or_expired_token":
        case "invalid_token":
          setStatus({ kind: "expired" });
          break;
        case "first_confirmation_missing":
          setStatus({ kind: "missing_first" });
          break;
        default:
          setStatus({ kind: "error", message: result.error ?? "Unknown error." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-md mx-auto flex items-center justify-center">
      <div className="w-full rounded-xl border border-border bg-card p-6">
        {status.kind === "loading" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Confirming…</p>
          </div>
        )}

        {status.kind === "success" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <h1 className="font-display text-xl font-bold">Parental consent confirmed</h1>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              {status.alreadyCompleted
                ? "Your account was already verified. You can add a child profile any time."
                : "Thanks. Your account is now verified to add and manage child profiles. You can return to Grace Flare and add your child."}
            </p>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90"
            >
              Continue to Grace Flare
            </button>
          </div>
        )}

        {status.kind === "expired" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-amber-600" />
              <h1 className="font-display text-xl font-bold">Link expired</h1>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              This confirmation link has expired or has already been used. Sign in
              and try to add a child again — we'll send a fresh link.
            </p>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        )}

        {status.kind === "missing_first" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-amber-600" />
              <h1 className="font-display text-xl font-bold">First step incomplete</h1>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              We don't have a record of your first email confirmation. Sign in to
              your account and confirm the first email we sent at signup before
              completing this step.
            </p>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        )}

        {status.kind === "error" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-destructive" />
              <h1 className="font-display text-xl font-bold">Something went wrong</h1>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{status.message}</p>
            <p className="text-xs text-muted-foreground">
              Need help? Email{" "}
              <a href="mailto:coppa@graceflare.com" className="text-primary underline">
                coppa@graceflare.com
              </a>
              .
            </p>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground text-center">
          <Link to="/privacy" className="underline">Privacy Policy</Link>
          {" · "}
          <Link to="/terms" className="underline">Terms</Link>
        </p>
      </div>
    </div>
  );
}
