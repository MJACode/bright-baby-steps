import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageInstructions } from "@/components/PageInstructions";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "@/hooks/use-toast";

const ASHA_DIRECTORY_URL = "https://find.asha.org/pro/";

export default function FindSlpPage() {
  const { prefs, setPrefs } = usePreferences();
  const [zip, setZip] = useState(prefs.lastSlpZip);

  const isValidZip = /^\d{5}$/.test(zip);

  const handleSearch = async () => {
    let copied = false;
    try {
      await navigator.clipboard?.writeText(zip);
      copied = true;
    } catch {
      /* non-secure context or denied */
    }

    window.open(ASHA_DIRECTORY_URL, "_blank", "noopener,noreferrer");

    toast({
      title: "Opening ASHA's directory",
      description: copied
        ? `Your ZIP (${zip}) is copied. Just paste it into the search box.`
        : `Enter your ZIP (${zip}) in the search box.`,
    });

    setPrefs({ lastSlpZip: zip });
  };

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="font-display text-2xl font-bold">Find a speech therapist</h1>
        <p className="text-muted-foreground text-sm mt-1 font-sans">
          Search ASHA's directory of certified speech-language pathologists near you.
        </p>
      </div>

      <PageInstructions tint="milestones">
        <p>Enter your ZIP code below.</p>
        <p>We open ASHA's certified-SLP directory (asha.org) in a new tab.</p>
        <p>Your ZIP is copied so you can paste it straight into their search.</p>
      </PageInstructions>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slp-zip" className="font-sans font-semibold text-sm">
              ZIP code
            </Label>
            <Input
              id="slp-zip"
              inputMode="numeric"
              maxLength={5}
              placeholder="ZIP code"
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
              className="min-h-[48px] font-sans"
            />
          </div>
          <Button
            type="button"
            className="w-full min-h-[48px] font-sans"
            disabled={!isValidZip}
            onClick={handleSearch}
          >
            Find therapists near you
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <a
          href={ASHA_DIRECTORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-[48px] text-sm font-semibold font-sans text-primary hover:underline"
        >
          Browse the full directory
        </a>
        <p className="text-sm text-muted-foreground font-sans">
          Prefer to call? ASHA: 800-638-8255
        </p>
      </div>

      <p className="text-xs text-muted-foreground font-sans">
        Grace Flare isn't affiliated with ASHA. This is a referral resource, not medical advice.
      </p>
    </div>
  );
}
