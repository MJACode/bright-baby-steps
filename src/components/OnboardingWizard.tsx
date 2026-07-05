import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInMonths, differenceInWeeks, differenceInDays, isValid, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PartnerRolePicker, type SyncChoice } from "@/components/onboarding/PartnerRolePicker";
import { InviteShareSheet } from "@/components/onboarding/InviteShareSheet";
import { checkAndRequestVpc, type VpcGateStatus } from "@/lib/vpcGate";
import { VpcGateMessage } from "@/components/VpcGateMessage";
import { CoppaDirectNotice } from "@/components/CoppaDirectNotice";
import { RetroactiveMilestoneCatchUp } from "@/components/onboarding/RetroactiveMilestoneCatchUp";
import { getAgeInMonths } from "@/hooks/useChildren";
import { UserPlus } from "lucide-react";

type PrimaryInterest = "sleep_feeding" | "developmental" | "speech" | "financial";

type RetroactiveStatus = "achieved" | "emerging" | "not_yet";

interface WizardState {
  name: string;
  dob: string;
  isPremature: boolean | null;
  dueDate: string;
  interest: PrimaryInterest | null;
  retroactiveMilestones: Record<string, RetroactiveStatus>;
}

const EMPTY_STATE: WizardState = {
  name: "",
  dob: "",
  isPremature: null,
  dueDate: "",
  interest: null,
  retroactiveMilestones: {},
};

// Draft persistence so a user who clicks the second VPC email link in a new
// tab — landing back on /dashboard → OnboardingWizard — resumes where they
// left off instead of restarting at step 1. Keyed by user id so accounts
// don't collide on a shared browser.
const draftKey = (uid: string) => `onboarding_draft_${uid}`;

interface Draft { step: number; state: WizardState }

// The furthest step the saved answers actually support. Guards against stale
// drafts written by the old 5-step layout (partner step removed 2026-07):
// an old `step: 5` clamps to the interest step, and an old `step: 3` with no
// DOB yet lands back on the DOB step instead of skipping past it.
function maxResumableStep(state: WizardState): number {
  if (!state.name.trim()) return 1;
  if (!state.dob || !computeAge(state.dob)) return 2;
  if (state.isPremature === null || (state.isPremature && !state.dueDate)) return 3;
  return 4;
}

function loadDraft(uid: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft> | null;
    if (!parsed || typeof parsed.step !== "number" || !Number.isFinite(parsed.step) || !parsed.state) return null;
    const state = { ...EMPTY_STATE, ...parsed.state };
    const step = Math.min(Math.max(1, Math.floor(parsed.step)), maxResumableStep(state));
    return { step, state };
  } catch {
    return null;
  }
}

function saveDraft(uid: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(uid), JSON.stringify(draft));
  } catch {
    // Quota or disabled storage — drafting is best-effort, not load-bearing.
  }
}

function clearDraft(uid: string) {
  try { localStorage.removeItem(draftKey(uid)); } catch { /* ignore */ }
}

const INTEREST_OPTIONS: { id: PrimaryInterest; label: string; preview: string }[] = [
  { id: "sleep_feeding", label: "Sleep and feeding",
    preview: "Track feeds, sleep, and diapers — and surface patterns to help you rest more and stress less." },
  { id: "developmental", label: "Developmental milestones",
    preview: "Map every milestone by age, see what's coming next, and get expert guidance when you need it." },
  { id: "speech", label: "Speech and language",
    preview: "The Word & Sound Journal tracks language development from babbles to sentences, with SLP-backed context." },
  { id: "financial", label: "Financial planning",
    preview: "Walk through 529s, the Child Tax Credit, dependent care FSAs, and childcare cost planning — step by step." },
];

const INTEREST_CTA: Record<PrimaryInterest, { label: string; route: string }> = {
  sleep_feeding: { label: "Log first feed", route: "/dashboard/feeding" },
  developmental: { label: "See milestones", route: "/dashboard/milestones" },
  speech: { label: "Open Word & Sound Journal", route: "/dashboard/milestones" },
  financial: { label: "Open Financial Checklist", route: "/dashboard/records?tab=financial" },
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

  const [step, setStep] = useState<number>(() => (user ? loadDraft(user.id)?.step ?? 1 : 1));
  const [saving, setSaving] = useState(false);
  const [vpcStatus, setVpcStatus] = useState<VpcGateStatus | null>(null);
  const [needsDirectNotice, setNeedsDirectNotice] = useState(false);
  const [state, setState] = useState<WizardState>(() => (user ? loadDraft(user.id)?.state ?? EMPTY_STATE : EMPTY_STATE));
  // Captured after the child INSERT succeeds so the step-5 catch-up can write
  // child_speech rows + stamp retroactive_setup_completed_at against the right row.
  const [createdChildId, setCreatedChildId] = useState<string | null>(null);

  // Welcome-screen partner invite card (optional, post-setup).
  const [partnerCardOpen, setPartnerCardOpen] = useState(false);
  const [partnerChoice, setPartnerChoice] = useState<SyncChoice | null>(null);
  const [partnerSheetOpen, setPartnerSheetOpen] = useState(false);
  const [partnerInviteSent, setPartnerInviteSent] = useState(false);
  const hasPartnerStampedRef = useRef(false);

  // Steps 1–4 are the required inputs; step 4 finishes setup. Step 5 is an
  // optional milestone catch-up shown only for children >= 1 month old
  // (newborns skip straight to the step-6 welcome).
  const TOTAL_STEPS = 4;

  useEffect(() => {
    if (!user) return;
    // Once the child has been created (step 5+), the wizard is no longer
    // restartable from a draft — the dashboard banner handles re-entry to the
    // catch-up, so stop persisting draft state here.
    if (step >= 5) return;
    saveDraft(user.id, { step, state });
  }, [user, step, state]);

  async function saveAndAdvance() {
    if (!user) return;
    setSaving(true);
    try {
      // COPPA direct-notice gate (16 CFR § 312.4(c)). Must be shown before any
      // identifiable info about the child is collected. Skip if already
      // acknowledged for this account.
      const { data: ackRow } = await supabase
        .from("profiles")
        .select("coppa_direct_notice_acknowledged_at")
        .eq("id", user.id)
        .maybeSingle<{ coppa_direct_notice_acknowledged_at: string | null }>();
      if (!ackRow?.coppa_direct_notice_acknowledged_at) {
        setNeedsDirectNotice(true);
        setSaving(false);
        return;
      }

      // COPPA email-plus VPC gate. Block child INSERT until vpc_completed_at is set.
      const status = await checkAndRequestVpc(user.id);
      if (status.kind !== "completed") {
        setVpcStatus(status);
        setSaving(false);
        return;
      }

      const ageMonths = getAgeInMonths(
        state.dob,
        state.isPremature ?? false,
        state.isPremature && state.dueDate ? state.dueDate : null
      );
      const skipCatchUp = ageMonths < 1;

      const { data: childRow, error: childError } = await supabase
        .from("children")
        .insert({
          parent_id: user.id,
          name: state.name.trim(),
          date_of_birth: state.dob,
          is_premature: state.isPremature ?? false,
          due_date: state.isPremature && state.dueDate ? state.dueDate : null,
          // Newborns skip the catch-up entirely — stamp at INSERT so the
          // MilestonesPage banner never fires for them.
          retroactive_setup_completed_at: skipCatchUp ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (childError) throw childError;

      // A user re-entering onboarding (e.g. after deleting their only child)
      // may already have a live partner — don't clobber has_partner back to false.
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("has_partner")
        .eq("id", user.id)
        .maybeSingle();

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          primary_interest: state.interest,
          // Flips to true if they send a partner invite from the welcome card.
          ...(profileRow?.has_partner ? {} : { has_partner: false }),
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (profileError) {
        // Non-fatal: the child INSERT already succeeded, so throwing here
        // would send the user back through saveAndAdvance and create a
        // duplicate child. Surface it and keep going.
        console.error("Onboarding profile update failed", profileError);
        toast({
          title: "We couldn't save your preferences",
          description: "You can set them later in Profile — everything else is ready to go.",
        });
      }

      clearDraft(user.id);
      setCreatedChildId(childRow.id);
      setStep(skipCatchUp ? 6 : 5);
    } catch (err) {
      console.error("Onboarding save failed", err);
      toast({
        title: "Couldn't finish setup",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePartnerInviteSent() {
    setPartnerInviteSent(true);
    if (!user || hasPartnerStampedRef.current) return;
    hasPartnerStampedRef.current = true;
    const { error } = await supabase
      .from("profiles")
      .update({ has_partner: true })
      .eq("id", user.id);
    if (error) {
      hasPartnerStampedRef.current = false;
      console.error("has_partner update failed", error);
      toast({
        title: "Couldn't save your partner setting",
        description: "Your invite still works — manage it anytime from Profile → Partner Access.",
        variant: "destructive",
      });
    }
  }

  function handleFinish() {
    queryClient.invalidateQueries({ queryKey: ["children"] });
    const cta = state.interest ? INTEREST_CTA[state.interest] : null;
    navigate(cta?.route ?? "/dashboard");
  }

  const firstName = state.name.trim() || "your little one";
  const computedAge = computeAge(state.dob);

  // Step 5: retroactive milestone catch-up — only for children >= 1 month old.
  // For newborns we skip straight to step 6 from saveAndAdvance().
  if (step === 5 && createdChildId) {
    const ageMonths = getAgeInMonths(
      state.dob,
      state.isPremature ?? false,
      state.isPremature && state.dueDate ? state.dueDate : null
    );
    return (
      <div className="flex flex-col min-h-[60vh] px-6 pt-8 pb-8 max-w-sm mx-auto">
        <RetroactiveMilestoneCatchUp
          childId={createdChildId}
          childName={firstName}
          ageMonths={ageMonths}
          initialMarks={state.retroactiveMilestones}
          onMarksChange={(marks) =>
            setState((s) => ({ ...s, retroactiveMilestones: marks }))
          }
          onDone={() => setStep(6)}
        />
      </div>
    );
  }

  // Step 6: personalized welcome + optional partner invite
  if (step === 6 && state.interest) {
    const features = INTEREST_FEATURES[state.interest];
    const cta = INTEREST_CTA[state.interest];
    return (
      <div className="flex flex-col items-center text-center px-6 pt-10 pb-8 min-h-[60vh]">
        <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-5">
          <span className="text-3xl">🎉</span>
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">{state.name.trim()} is all set.</h2>
        <p className="text-muted-foreground text-sm mb-8 max-w-xs">
          Here's what Grace Flare will help you with most:
        </p>
        <ul className="w-full max-w-xs text-left space-y-3 mb-8">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <span className="text-primary mt-0.5">✓</span><span>{f}</span>
            </li>
          ))}
        </ul>

        {partnerInviteSent ? (
          <div className="w-full max-w-xs rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5 text-left mb-8">
            <p className="text-sm font-semibold text-primary">Invite sent</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The link is also saved in Profile → Partner Access if you need it again.
            </p>
          </div>
        ) : partnerCardOpen ? (
          <div className="w-full max-w-xs text-left mb-8">
            <p className="text-sm font-semibold mb-3">Who's tracking {firstName} with you?</p>
            <PartnerRolePicker
              value={partnerChoice}
              onChange={(v) => {
                if (v.kind === "invite") {
                  setPartnerChoice(v);
                  setPartnerSheetOpen(true);
                } else {
                  setPartnerChoice(null);
                  setPartnerCardOpen(false);
                }
              }}
              babyName={firstName}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPartnerCardOpen(true)}
            className="w-full max-w-xs min-h-[48px] rounded-2xl border border-border bg-card px-4 py-3.5 text-left mb-8 flex items-start gap-3 transition-colors hover:bg-muted"
          >
            <span className="shrink-0 w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-foreground">Parenting with a partner?</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Invite them to sync — you can also do this anytime from Profile → Partner Access.
              </span>
            </span>
          </button>
        )}

        <Button className="w-full max-w-xs" onClick={handleFinish}>
          {cta.label}
        </Button>

        {partnerChoice?.kind === "invite" && user && (
          <InviteShareSheet
            open={partnerSheetOpen}
            onOpenChange={setPartnerSheetOpen}
            ownerId={user.id}
            role={partnerChoice.role}
            babyName={firstName}
            onSent={() => { void handlePartnerInviteSent(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[60vh] px-6 pt-8 pb-8 max-w-sm mx-auto">
      <div
        className="mb-8 flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        aria-label={`Setup step ${step} of ${TOTAL_STEPS}`}
      >
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i + 1 < step ? "bg-primary" : i + 1 === step ? "bg-primary/60" : "bg-muted"
            )}
          />
        ))}
      </div>

      {/* Step 1: Name */}
      {step === 1 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">Who are we setting up a profile for?</h2>
          <p className="text-muted-foreground text-sm mb-8">This personalizes everything in the app.</p>
          <Input autoFocus placeholder="Baby's name" value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            className="text-lg h-12"
            onKeyDown={(e) => { if (e.key === "Enter" && state.name.trim()) setStep(2); }}
          />
          <div className="mt-auto pt-8">
            <Button className="w-full" disabled={!state.name.trim()} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </div>
      )}

      {/* Step 2: Date of birth */}
      {step === 2 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">When was {firstName} born?</h2>
          <p className="text-muted-foreground text-sm mb-8">We use this to calibrate milestones and tracking to the right age.</p>
          <Input autoFocus type="date" value={state.dob}
            onChange={(e) => setState((s) => ({ ...s, dob: e.target.value }))} className="text-base h-12" />
          {computedAge && <p className="text-primary text-sm font-medium mt-3">{firstName} is {computedAge}</p>}
          <div className="mt-auto pt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
            <Button className="flex-1" disabled={!state.dob || !computedAge} onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      )}

      {/* Step 3: Born early */}
      {step === 3 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">Was {firstName} born early?</h2>
          <p className="text-muted-foreground text-sm mb-8">
            If {firstName} was premature, we use corrected age for all milestone guidance — the way pediatricians do.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button onClick={() => setState((s) => ({ ...s, isPremature: true }))}
              className={cn("rounded-xl border-2 py-4 text-sm font-medium transition-colors",
                state.isPremature === true ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground")}>
              Yes, born early
            </button>
            <button onClick={() => setState((s) => ({ ...s, isPremature: false, dueDate: "" }))}
              className={cn("rounded-xl border-2 py-4 text-sm font-medium transition-colors",
                state.isPremature === false ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground")}>
              No, full term
            </button>
          </div>
          {state.isPremature && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">What was the original due date?</p>
              <Input type="date" value={state.dueDate}
                onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))} className="h-12" />
            </div>
          )}
          <div className="mt-auto pt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
            <Button className="flex-1"
              disabled={state.isPremature === null || (state.isPremature === true && !state.dueDate)}
              onClick={() => setStep(4)}>Continue</Button>
          </div>
        </div>
      )}

      {/* Step 4: What matters most — also finishes setup */}
      {step === 4 && (
        <div className="flex flex-col flex-1">
          <h2 className="font-display text-2xl font-bold mb-2">What matters most to you right now?</h2>
          <p className="text-muted-foreground text-sm mb-6">Pick one — you can explore everything once you're in.</p>
          <div className="space-y-3 mb-4">
            {INTEREST_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => setState((s) => ({ ...s, interest: opt.id }))}
                className={cn("w-full rounded-xl border-2 px-4 py-3.5 text-left transition-colors",
                  state.interest === opt.id ? "border-primary bg-primary/10" : "border-border bg-card")}>
                <span className={cn("text-sm font-medium",
                  state.interest === opt.id ? "text-primary" : "text-foreground")}>{opt.label}</span>
              </button>
            ))}
          </div>
          {state.interest && (
            <p className="text-xs text-muted-foreground px-1 min-h-[2.5rem]">
              {INTEREST_OPTIONS.find((o) => o.id === state.interest)?.preview}
            </p>
          )}
          {needsDirectNotice && user && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <CoppaDirectNotice
                userId={user.id}
                onAcknowledged={() => {
                  setNeedsDirectNotice(false);
                  saveAndAdvance();
                }}
                onCancel={() => setNeedsDirectNotice(false)}
              />
            </div>
          )}
          {vpcStatus && vpcStatus.kind !== "completed" && (
            <div className="mt-4">
              <VpcGateMessage status={vpcStatus} onDismiss={() => setVpcStatus(null)} />
            </div>
          )}
          <div className="mt-auto pt-6">
            {!needsDirectNotice && !vpcStatus && (
              <p className="text-xs text-muted-foreground mb-3 px-1">
                Next: we'll send a quick confirmation email to verify it's you — takes about a minute.
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Back</Button>
              <Button className="flex-1" disabled={!state.interest || saving} onClick={saveAndAdvance}>
                {saving ? "Setting up..." : "Finish setup"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
