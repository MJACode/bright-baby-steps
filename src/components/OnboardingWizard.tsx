import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { format, differenceInMonths, differenceInWeeks, differenceInDays, isValid, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { APP_URL } from "@/lib/appUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type PrimaryInterest = "sleep_feeding" | "developmental" | "speech" | "financial";

interface WizardState {
  name: string;
  dob: string;
  isPremature: boolean | null;
  dueDate: string;
  interest: PrimaryInterest | null;
  hasPartner: boolean | null;
}

const INTEREST_OPTIONS: { id: PrimaryInterest; label: string; preview: string }[] = [
  {
    id: "sleep_feeding",
    label: "Sleep and feeding",
    preview: "Track feeds, sleep, and diapers — and surface patterns to help you rest more and stress less.",
  },
  {
    id: "developmental",
    label: "Developmental milestones",
    preview: "Map every milestone by age, see what's coming next, and get expert guidance when you need it.",
  },
  {
    id: "speech",
    label: "Speech and language",
    preview: "The Word & Sound Journal tracks language development from babbles to sentences, with SLP-backed context at every stage.",
  },
  {
    id: "financial",
    label: "Financial planning",
    preview: "Walk through 529s, the Child Tax Credit, dependent care FSAs, and childcare cost planning — step by step.",
  },
];

const INTEREST_CTA: Record<PrimaryInterest, { label: string; route: string }> = {
  sleep_feeding: { label: "Log first feed", route: "/dashboard/feeding" },
  developmental: { label: "See milestones", route: "/dashboard/milestones" },
  speech: { label: "Open Word & Sound Journal", route: "/dashboard/milestones" },
  financial: { label: "Open Financial Checklist", route: "/dashboard/milestones?tab=financial" },
};

const INTEREST_FEATURES: Record<PrimaryInterest, string[]> = {
  sleep_feeding: ["Feeding tracker with pattern analysis", "Sleep log with wake window guidance", "Diaper tracker"],
  developmental: ["Milestone tracker by age", "Developmental advisor (AI)", "Upcoming milestone alerts"],
  speech: ["Word & Sound Journal", "Speech-Language Pathologist advisor", "Language milestone tracking"],
  financial: ["529 setup checklist", "Child Tax Credit guide", "Dependent care FSA and childcare cost planning"],
};

function computeAge(dob: string): string | null {
  const parsed = dob.length === 10 ? parseISO(dob) : null;
  if (!parsed || !isValid(parsed)) return null;
  const now = new Date();
  if (parsed > now) {
    const weeks = differenceInWeeks(parsed, now);
    const days = differenceInDays(parsed, now);
    if (days <= 7) return "Due soon";
    return `Due in ${weeks}w`;
  }
  const months = differenceInMonths(now, parsed);
  const weeks = differenceInWeeks(now, parsed);
  const days = differenceInDays(now, parsed);
  if (months < 1) return `${weeks}w ${days % 7}d old`;
  if (months < 24) return `${months} months old`;
  return `${Math.floor(months / 12)}y ${months % 12}mo old`;
}

export function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<WizardState>({
    name: "",
    dob: "",
    isPremature: null,
    dueDate: "",
    interest: null,
    hasPartner: null,
  });

  const TOTAL_STEPS = 5; // steps 1-5; step 6 is the welcome screen

  async function saveAndAdvance() {
    if (!user) return;
    setSaving(true);
    try {
      const { error: childError } = await supabase.from("children").insert({
        parent_id: user.id,
        name: state.name.trim(),
        date_of_birth: state.dob,
        is_premature: state.isPremature ?? false,
        due_date: state.isPremature && state.dueDate ? state.dueDate : null,
      });
      if (childError) throw childError;

      await supabase
        .from("profiles")
        .update({
          primary_interest: state.interest,
          has_partner: state.hasPartner ?? false,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      setStep(6);
    } catch {
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function generateInvite() {
    if (!user || inviteLink) return;
    setInviteLoading(true);
    try {
      const { data, error } = await supabase
        .from("partner_invitations")
        .insert({ owner_id: user.id })
        .select()
        .single();
      if (error) throw error;
      setInviteLink(`${APP_URL}/invite/${data.invite_code}`);
    } catch {
      toast({ title: "Couldn't create invite link. Try again.", variant: "destructive" });
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    if (Capacitor.isNativePlatform()) {
      await Clipboard.write({ string: inviteLink });
    } else {
      await navigator.clipboard.writeText(inviteLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFinish() {
    queryClient.invalidateQueries({ queryKey: ["children"] });
    const cta = state.interest ? INTEREST_CTA[state.interest] : null;
    navigate(cta?.route ?? "/dashboard");
  }

  const firstName = state.name.trim() || "your little one";
  const computedAge = computeAge(state.dob);

  // Step 6: personalized welcome
  if (step === 6 && state.interest) {
    const features = INTEREST_FEATURES[state.interest];
    const cta = INTEREST_CTA[state.interest];
    return (
      <div className="flex flex-col items-center text-center px-6 pt-10 pb-8 min-h-[60vh]">
        <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">🎉</span>
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">
          {state.name.trim()} is all set.
        </h2>
        <p className="text-muted-foreground text-sm mb-8 max-w-xs">
          Here's what Grace Flare will help you with most:
        </p>
        <ul className="w-full max-w-xs text-left space-y-3 mb-10">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <span className="text-primary mt-0.5">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {state.hasPartner && inviteLink && (
          <p className="text-xs text-muted-foreground mb-6 max-w-xs">
            Your partner can join using the invite link you copied.
          </p>
        )}
        <Button className="w-full max-w-xs" onClick={handleFinish}>
          {cta.label}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[60vh] px-6 pt-8 pb-8 max-w-sm mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <Progress value={(step / TOTAL_STEPS) * 100} className="h-1.5" />
        <p className="text-xs text-muted-foreground mt-2 text-right">{step} of {TOTAL_STEPS}</p>
      </div>

      {/* Step 1: Name */}
      {step === 1 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">Who are we setting up a profile for?</h2>
          <p className="text-muted-foreground text-sm mb-8">This personalizes everything in the app.</p>
          <Input
            autoFocus
            placeholder="Baby's name"
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            className="text-lg h-12"
            onKeyDown={(e) => { if (e.key === "Enter" && state.name.trim()) setStep(2); }}
          />
          <div className="mt-auto pt-8">
            <Button
              className="w-full"
              disabled={!state.name.trim()}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Date of birth */}
      {step === 2 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">When was {firstName} born?</h2>
          <p className="text-muted-foreground text-sm mb-8">We use this to calibrate milestones and tracking to the right age.</p>
          <Input
            autoFocus
            type="date"
            value={state.dob}
            onChange={(e) => setState((s) => ({ ...s, dob: e.target.value }))}
            className="text-base h-12"
          />
          {computedAge && (
            <p className="text-primary text-sm font-medium mt-3">
              {firstName} is {computedAge}
            </p>
          )}
          <div className="mt-auto pt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
            <Button
              className="flex-1"
              disabled={!state.dob || !computedAge}
              onClick={() => setStep(3)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Born early? */}
      {step === 3 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">Was {firstName} born early?</h2>
          <p className="text-muted-foreground text-sm mb-8">
            If {firstName} was premature, we use corrected age for all milestone guidance — the way pediatricians do.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setState((s) => ({ ...s, isPremature: true }))}
              className={cn(
                "rounded-xl border-2 py-4 text-sm font-medium transition-colors",
                state.isPremature === true
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground"
              )}
            >
              Yes, born early
            </button>
            <button
              onClick={() => setState((s) => ({ ...s, isPremature: false, dueDate: "" }))}
              className={cn(
                "rounded-xl border-2 py-4 text-sm font-medium transition-colors",
                state.isPremature === false
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground"
              )}
            >
              No, full term
            </button>
          </div>
          {state.isPremature && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">What was the original due date?</p>
              <Input
                type="date"
                value={state.dueDate}
                onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))}
                className="h-12"
              />
            </div>
          )}
          <div className="mt-auto pt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
            <Button
              className="flex-1"
              disabled={
                state.isPremature === null ||
                (state.isPremature === true && !state.dueDate)
              }
              onClick={() => setStep(4)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: What matters most */}
      {step === 4 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">What matters most to you right now?</h2>
          <p className="text-muted-foreground text-sm mb-6">Pick one — you can explore everything once you're in.</p>
          <div className="space-y-3 mb-4">
            {INTEREST_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setState((s) => ({ ...s, interest: opt.id }))}
                className={cn(
                  "w-full rounded-xl border-2 px-4 py-3.5 text-left transition-colors",
                  state.interest === opt.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card"
                )}
              >
                <span className={cn("text-sm font-medium", state.interest === opt.id ? "text-primary" : "text-foreground")}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
          {state.interest && (
            <p className="text-xs text-muted-foreground px-1 min-h-[2.5rem]">
              {INTEREST_OPTIONS.find((o) => o.id === state.interest)?.preview}
            </p>
          )}
          <div className="mt-auto pt-6 flex gap-3">
            <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Back</Button>
            <Button
              className="flex-1"
              disabled={!state.interest}
              onClick={() => setStep(5)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Partner invite */}
      {step === 5 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">Anyone else tracking with you?</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Partners see the same data in real time — every feed, sleep, and milestone logged by either of you.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setState((s) => ({ ...s, hasPartner: true }))}
              className={cn(
                "rounded-xl border-2 py-4 text-sm font-medium transition-colors",
                state.hasPartner === true
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground"
              )}
            >
              Yes
            </button>
            <button
              onClick={() => setState((s) => ({ ...s, hasPartner: false }))}
              className={cn(
                "rounded-xl border-2 py-4 text-sm font-medium transition-colors",
                state.hasPartner === false
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground"
              )}
            >
              Just me
            </button>
          </div>
          {state.hasPartner && (
            <div className="space-y-3">
              {!inviteLink ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={generateInvite}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? "Creating link..." : "Generate invite link"}
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                  <span className="flex-1 text-xs text-muted-foreground truncate">{inviteLink}</span>
                  <button
                    onClick={copyInvite}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Copy invite link"
                  >
                    {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                They'll create their own account and get full access to {firstName}'s profile.
              </p>
            </div>
          )}
          <div className="mt-auto pt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(4)} className="flex-1">Back</Button>
            <Button
              className="flex-1"
              disabled={state.hasPartner === null || saving}
              onClick={saveAndAdvance}
            >
              {saving ? "Setting up..." : "Finish setup"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
