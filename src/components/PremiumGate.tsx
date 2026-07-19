import { ReactNode, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePremium, type PremiumFeature, PREMIUM_FEATURES } from "@/hooks/usePremium";
import { UpgradeSheet } from "@/components/UpgradeSheet";

interface PremiumGateProps {
  feature: PremiumFeature;
  children: ReactNode;
  /** Render style for non-premium users. */
  variant?: "blur" | "replace" | "inline";
  /** Optional label override (defaults to PREMIUM_FEATURES[feature]). */
  label?: string;
  /** Optional body copy override for the replace-variant teaser card. */
  description?: string;
  /** Hide entirely on free tier (used for inline rows we don't want to tease). */
  hideOnFree?: boolean;
}

/**
 * Wraps premium content. On free tier, blurs the children and overlays an
 * "Unlock with Flare+" CTA. On premium, renders children unchanged.
 *
 * Variants:
 *   blur     — show preview blurred + overlay CTA (best for cards)
 *   replace  — replace with a compact teaser card
 *   inline   — small "PRO" badge + click opens UpgradeSheet
 */
export function PremiumGate({
  feature,
  children,
  variant = "blur",
  label,
  description,
  hideOnFree = false,
}: PremiumGateProps) {
  const { isPremium, isLoading } = usePremium();
  const [open, setOpen] = useState(false);

  if (isLoading) return <>{children}</>;
  if (isPremium) return <>{children}</>;
  if (hideOnFree) return null;

  const featureLabel = label ?? PREMIUM_FEATURES[feature];

  if (variant === "inline") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-foreground/90 text-[10px] font-bold tracking-wider text-warning uppercase font-mono"
        >
          <Lock className="w-2.5 h-2.5" strokeWidth={2.5} />
          Pro
        </button>
        <UpgradeSheet open={open} onOpenChange={setOpen} feature={feature} />
      </>
    );
  }

  if (variant === "replace") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-2xl border border-primary/20 bg-primary/5 p-4 active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wide text-primary">
              {featureLabel}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-snug">
            {description ?? "Unlock with Flare+ — predictive insights tailored to your baby."}
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            Try free for 7 days <span aria-hidden>→</span>
          </div>
        </button>
        <UpgradeSheet open={open} onOpenChange={setOpen} feature={feature} />
      </>
    );
  }

  // blur variant
  return (
    <>
      <div className="relative rounded-2xl overflow-hidden">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none select-none",
            "[&_*]:!cursor-default"
          )}
          style={{ filter: "blur(6px) saturate(0.85)", opacity: 0.7 }}
        >
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-background/40 backdrop-blur-[2px]">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-foreground text-warning text-[10px] font-bold uppercase tracking-wider font-mono mb-2">
              <Lock className="w-3 h-3" strokeWidth={2.5} />
              Flare+
            </div>
            <p className="font-display text-base font-semibold mb-2">
              {featureLabel}
            </p>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className="rounded-full"
            >
              Try free for 7 days
            </Button>
          </div>
        </div>
      </div>
      <UpgradeSheet open={open} onOpenChange={setOpen} feature={feature} />
    </>
  );
}
