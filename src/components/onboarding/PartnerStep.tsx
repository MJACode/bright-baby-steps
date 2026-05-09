// src/components/onboarding/UpdatedWizardStep.tsx
// EXAMPLE replacement for OnboardingWizard step 5 (partner) — but moved to step 2.
// You can either:
//   (a) refactor your existing OnboardingWizard to insert these screens at step 2, OR
//   (b) copy the snippet below into wherever step 2 currently lives.
//
// This file is illustrative — it shows the new step 2 + a small auto-advance.

import { useState } from "react";
import type { SyncChoice } from "./PartnerRolePicker";
import { PartnerRolePicker } from "./PartnerRolePicker";
import { InviteShareSheet } from "./InviteShareSheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  babyName: string;
  onBack: () => void;
  onContinue: (choice: SyncChoice & { inviteCode?: string }) => void;
}

export function PartnerStep({ babyName, onBack, onContinue }: Props) {
  const { user } = useAuth();
  const [choice, setChoice] = useState<SyncChoice | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const canContinue = choice !== null;
  const pickedButDeferred =
    choice?.kind === "invite" && !inviteCode && !sheetOpen;

  return (
    <div className="flex flex-col flex-1">
      <div className="mb-6">
        <p className="text-xs font-mono uppercase tracking-wide text-primary mb-2">
          Before we go further
        </p>
        <h2 className="font-display text-2xl font-bold leading-tight mb-2">
          Who's going to track {babyName} with you?
        </h2>
        <p className="text-sm text-muted-foreground">
          We'll set them up at the same time, so the first feed you log already
          shows up on their phone.
        </p>
      </div>

      <PartnerRolePicker
        value={choice}
        onChange={(v) => {
          setChoice(v);
          setInviteCode(null);
          if (v.kind === "invite") setSheetOpen(true);
        }}
        babyName={babyName}
      />

      {pickedButDeferred && (
        <p className="text-[11px] text-muted-foreground px-1 mt-3">
          No rush — we'll save the invite link in Profile → Partner Access so you can send it whenever you're ready.
        </p>
      )}

      <div className="mt-auto pt-8 flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!canContinue}
          onClick={() => onContinue({ ...choice!, inviteCode: inviteCode ?? undefined })}
        >
          Continue
        </Button>
      </div>

      {choice?.kind === "invite" && user && (
        <InviteShareSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          ownerId={user.id}
          role={choice.role}
          babyName={babyName}
          onSent={(code) => setInviteCode(code)}
        />
      )}
    </div>
  );
}
