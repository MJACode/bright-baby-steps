// src/components/onboarding/PartnerRolePicker.tsx
// Step 2 of the new sync-first onboarding.
// Shown right after baby's name. Decides: who's tracking with you, and as what.

import { cn } from "@/lib/utils";
import { Check, Users, HeartHandshake } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { PartnerRole } from "@/lib/partnerInvite";
import { CAREGIVER_COACH_COPY, PARTNER_ROLES, ROLE_COPY } from "@/lib/partnerInvite";

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
};

export function PartnerRolePicker({ value, onChange, babyName }: Props) {
  const selectedRole =
    value?.kind === "invite" ? value.role : null;
  const skipped = value?.kind === "skip";

  return (
    <div className="space-y-3">
      {PARTNER_ROLES.map((r) => {
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

/**
 * What a caregiver can use, chosen by a Flare+ owner. Callers render it only
 * for a caregiver on Flare+; on the free plan the choice is hidden entirely.
 */
export function CaregiverCoachChoice({
  value,
  onChange,
  disabled = false,
  idPrefix = "caregiver-coach",
}: {
  value: boolean;
  onChange: (coach: boolean) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const options = [
    { coach: false, ...CAREGIVER_COACH_COPY.off },
    { coach: true, ...CAREGIVER_COACH_COPY.on },
  ];
  return (
    <RadioGroup
      value={value ? "on" : "off"}
      onValueChange={(v) => onChange(v === "on")}
      disabled={disabled}
      aria-label="What your caregiver can use"
      className="gap-2"
    >
      {options.map((o) => {
        const id = `${idPrefix}-${o.coach ? "on" : "off"}`;
        const selected = o.coach === value;
        return (
          <label
            key={id}
            htmlFor={id}
            className={cn(
              "touch-target flex items-start gap-3 rounded-xl border-2 px-3 py-3 transition-colors",
              disabled ? "opacity-60" : "cursor-pointer",
              selected ? "border-primary bg-primary/10" : "border-border bg-card",
            )}
          >
            <RadioGroupItem id={id} value={o.coach ? "on" : "off"} className="mt-0.5 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className={cn("block text-sm font-semibold", selected ? "text-primary" : "text-foreground")}>
                {o.title}
              </span>
              <span className="block text-xs text-muted-foreground leading-snug mt-0.5">{o.desc}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
