import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type RequestType =
  | "access"
  | "correction"
  | "deletion"
  | "portability"
  | "objection"
  | "sensitive_pi_limit"
  | "withdraw_consent"
  | "coppa_review"
  | "coppa_delete"
  | "coppa_refuse_further"
  | "other";

const REQUEST_TYPES: { id: RequestType; label: string; hint: string }[] = [
  { id: "access", label: "Access my data", hint: "Get a copy of the data we hold about you or your child." },
  { id: "correction", label: "Correct inaccurate data", hint: "Fix something that's wrong." },
  { id: "deletion", label: "Delete my account", hint: "Erase your account and all associated data (GDPR Art. 17)." },
  { id: "portability", label: "Export my data", hint: "Receive a machine-readable copy (GDPR Art. 20)." },
  { id: "objection", label: "Object to processing", hint: "Stop us using your data for a specific purpose (GDPR Art. 21)." },
  { id: "sensitive_pi_limit", label: "Limit sensitive PI use (CA)", hint: "Limit our use of your child's health data (CPRA § 1798.121)." },
  { id: "withdraw_consent", label: "Withdraw consent", hint: "Withdraw a previously given consent." },
  { id: "coppa_review", label: "Review my child's data (COPPA)", hint: "See what we have on file for your child." },
  { id: "coppa_delete", label: "Delete my child's data (COPPA)", hint: "Erase your child's data while keeping your account." },
  { id: "coppa_refuse_further", label: "Stop further child data collection", hint: "Pause new collection without deleting existing data." },
  { id: "other", label: "Other request", hint: "Anything not covered above." },
];

export default function RightsRequestPage() {
  const { user } = useAuth();
  const [requestType, setRequestType] = useState<RequestType | null>(null);
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user, email]);

  const canSubmit = !!requestType && !!email.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !requestType) return;
    setSubmitting(true);

    const { error } = await supabase.from("rights_requests").insert({
      request_type: requestType,
      email: email.trim(),
      user_id: user?.id ?? null,
      description: description.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      toast({
        title: "Couldn't submit your request",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 max-w-md mx-auto flex items-center justify-center">
        <div className="w-full rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            <h1 className="font-display text-xl font-bold">Request received</h1>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            We've logged your request. We'll acknowledge by email within{" "}
            <strong>10 days</strong> and respond in full within{" "}
            <strong>30 days</strong>, as promised in our{" "}
            <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.
            We may follow up to verify your identity (we'll confirm control of
            the email on file plus one account-specific data point).
          </p>
          <Link
            to="/privacy"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Privacy Policy
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 max-w-2xl mx-auto">
      <Link to="/privacy" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Privacy Policy
      </Link>

      <div className="space-y-1 mb-6">
        <h1 className="font-display text-2xl font-bold">Submit a privacy request</h1>
        <p className="text-sm text-muted-foreground">
          Use this form to exercise your rights under GDPR, CCPA/CPRA, or COPPA.
          You don't need to be signed in.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium">What would you like to do?</Label>
          <div className="space-y-2">
            {REQUEST_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setRequestType(t.id)}
                className={`w-full rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                  requestType === t.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted/50"
                }`}
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Your email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <p className="text-xs text-muted-foreground">
            We'll use this to verify your identity and respond.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Tell us more (optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any specific data, time period, or context that helps us locate your records."
            rows={4}
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            We don't ask for sensitive identifiers here. To protect your data,
            we may verify your identity by email and one account-specific
            question before fulfilling your request. Full details:{" "}
            <Link to="/privacy" className="text-primary underline">Privacy Policy § 7</Link>.
          </p>
        </div>

        <Button type="submit" disabled={!canSubmit} className="w-full">
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </form>
    </div>
  );
}
