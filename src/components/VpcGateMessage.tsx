import { AlertCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VpcGateStatus } from "@/lib/vpcGate";

interface Props {
  status: VpcGateStatus;
  onDismiss?: () => void;
}

function formatExpiresIn(iso: string): string {
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "now";
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function VpcGateMessage({ status, onDismiss }: Props) {
  if (status.kind === "completed") return null;

  if (status.kind === "first_pending") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-sm text-amber-900">Confirm your email first</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Before you can add a child profile, please click the confirmation link in the email
              we sent when you signed up. This is the first step of parental consent under U.S.
              children's-privacy law (COPPA).
            </p>
          </div>
        </div>
        {onDismiss && (
          <Button variant="outline" size="sm" onClick={onDismiss} className="w-full">Close</Button>
        )}
      </div>
    );
  }

  if (status.kind === "second_email_sent") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <MailCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-sm text-emerald-900">Check your email</p>
            <p className="text-xs text-emerald-800 leading-relaxed">
              We just sent the second parental-consent email to your inbox. Click the link to
              finish verifying your account; once that's done, return here and add your child.
              The link expires {formatExpiresIn(status.expiresAt)}.
            </p>
          </div>
        </div>
        {onDismiss && (
          <Button variant="outline" size="sm" onClick={onDismiss} className="w-full">Close</Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-sm text-destructive">Couldn't verify parental consent</p>
          <p className="text-xs text-destructive/80 leading-relaxed">
            {status.message}. If this keeps happening, email coppa@graceflare.com.
          </p>
        </div>
      </div>
      {onDismiss && (
        <Button variant="outline" size="sm" onClick={onDismiss} className="w-full">Close</Button>
      )}
    </div>
  );
}
