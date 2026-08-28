import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  userId: string;
  onAcknowledged: () => void;
  onCancel?: () => void;
}

export function CoppaDirectNotice({ userId, onAcknowledged, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [isGuardian, setIsGuardian] = useState(false);
  const [isAdult, setIsAdult] = useState(false);

  const trimmedName = signedName.trim();
  const isNameValid = trimmedName.split(/\s+/).filter(Boolean).length >= 2;
  const canSubmit = isGuardian && isAdult && isNameValid && !saving;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({
        coppa_direct_notice_acknowledged_at: now,
        coppa_attestation_signed_name: trimmedName,
        coppa_attestation_signed_at: now,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save your acknowledgement.", description: error.message, variant: "destructive" });
      return;
    }
    onAcknowledged();
  };

  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground/85">
      <div className="flex items-center gap-2 text-foreground">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="font-display font-semibold">Before we add your child</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        U.S. children's privacy law (COPPA, 16 CFR § 312.4(c)) requires us to give
        you a direct notice before collecting information about your child.
        Please read this and confirm to continue.
      </p>

      <div className="space-y-3 text-xs">
        <div>
          <p className="font-medium text-foreground">What we collect</p>
          <p className="text-foreground/80">
            Your child's name, date of birth, optional gender and photo, optional
            interests and temperament you choose from a fixed list, any tracking
            data you log (sleep, feeding, diaper, allergens, milestones, play
            activities you mark as tried, sign-language signs you mark as
            introduced or used, illnesses, medications, supplements),
            and short AI-generated notes
            about your child that you can review, edit, and delete.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">How we use it</p>
          <p className="text-foreground/80">
            To provide tracking features, generate AI-assisted briefings and insights
            responses, and produce charts and milestone progress for you. We do
            not use your child's data to train AI models or for advertising.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">Who we share it with</p>
          <p className="text-foreground/80">
            Only the operational service providers listed at{" "}
            <Link to="/subprocessors" target="_blank" className="text-primary underline">
              /subprocessors
            </Link>{" "}
            (currently Supabase for hosting, Anthropic for AI, Resend for email),
            each under a written data-processing agreement, plus any co-parent or
            caregiver you explicitly invite via Partner Access. We do not sell or
            share your child's data for advertising.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">Your rights as a parent</p>
          <p className="text-foreground/80">
            You can review, delete, or stop further collection of your child's
            data at any time. Manage from Profile → Manage Child Data, or email{" "}
            <a href="mailto:coppa@graceflare.com" className="text-primary underline">
              coppa@graceflare.com
            </a>
            .
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Full details are in our{" "}
        <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>
        {" and "}
        <Link to="/terms" target="_blank" className="text-primary underline">Terms</Link>.
      </p>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="coppa-signed-name" className="text-xs font-medium">
            Type your full legal name as your digital signature
          </Label>
          <Input
            id="coppa-signed-name"
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder="e.g. Jane A. Doe"
            autoComplete="name"
            disabled={saving}
            aria-invalid={signedName.length > 0 && !isNameValid}
          />
        </div>

        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={isGuardian}
            onCheckedChange={(v) => setIsGuardian(v === true)}
            disabled={saving}
            className="mt-0.5"
          />
          <span>I am the parent or legal guardian of this child.</span>
        </label>

        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={isAdult}
            onCheckedChange={(v) => setIsAdult(v === true)}
            disabled={saving}
            className="mt-0.5"
          />
          <span>I am 18 years of age or older.</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
            Not now
          </Button>
        )}
        <Button type="button" className="flex-1" onClick={handleConfirm} disabled={!canSubmit}>
          {saving ? "Saving…" : "Sign and continue"}
        </Button>
      </div>
    </div>
  );
}
