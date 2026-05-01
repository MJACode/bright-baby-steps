// src/components/onboarding/PartnerRolePicker.tsx
// Step 2 of the new sync-first onboarding.
// Shown right after baby's name. Decides: who's tracking with you, and as what.

import { cn } from "@/lib/utils";
import { Check, Users, HeartHandshake, Eye } from "lucide-react";
import type { PartnerRole } from "@/lib/partnerInvite";
import { ROLE_COPY } from "@/lib/partnerInvite";

export type SyncChoice =
  | { kind: "skip" }
  | { kind: "invite"; role: PartnerRole };

interface Props {
  value: SyncChoice | null;
  onChange: (v: SyncChoice) => void;
  babyName: string;
}

const ROLE_ICON: Record<PartnerRole, React.ComponentType<{ className?: string }>> = {
  coparent: Users,
  caregiver: HeartHandshake,
  viewer: Eye,
};

export function PartnerRolePicker({ value, onChange, babyName }: Props) {
  const selectedRole =
    value?.kind === "invite" ? value.role : null;
  const skipped = value?.kind === "skip";

  return (
    <div className="space-y-3">
      {(["coparent", "caregiver", "viewer"] as PartnerRole[]).map((r) => {
        const copy = ROLE_COPY[r];
        const Icon = ROLE_ICON[r];
        const selected = selectedRole === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange({ kind: "invite", role: r })}
            className={cn(
              "w-full flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors",
              selected
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            )}
          >
            <div
              className={cn(
                "shrink-0 w-11 h-11 rounded-xl flex items-center justify-center",
                selected ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    selected ? "text-primary" : "text-foreground"
                  )}
                >
                  {copy.title}
                </span>
                {selected && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                {copy.desc}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground/80 mt-1.5 uppercase tracking-wide">
                {copy.sub}
              </p>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onChange({ kind: "skip" })}
        className={cn(
          "w-full rounded-2xl border-2 border-dashed px-4 py-3 text-sm font-medium transition-colors",
          skipped
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground"
        )}
      >
        Just me for now
      </button>

      {skipped && (
        <p className="text-[11px] text-muted-foreground px-1">
          You can invite anyone later from {babyName}'s family page.
        </p>
      )}
    </div>
  );
}
