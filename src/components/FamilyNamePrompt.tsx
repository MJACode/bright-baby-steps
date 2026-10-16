import { useState } from "react";
import { UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { OWN_NAME_MAX_LENGTH, useOwnDisplayName, useOwnFamilyAccess } from "@/hooks/useOwnDisplayName";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ownNameReachesFamily, shouldShowFamilyNamePrompt } from "@/lib/familyNamePrompt";

/**
 * One-time ask for the name family members see on "logged by" chips. Only
 * shows once the profile has loaded with no name AND the name would actually
 * appear to someone: a solo parent never sees attribution, and a partner the
 * owner has already labelled is shown by that label instead.
 */
export function FamilyNamePrompt() {
  const { user } = useAuth();
  const { prefs, setPrefs } = usePreferences();
  const [name, setName] = useState("");

  const enabled = !prefs.familyNamePromptDismissed;
  const { fullName, isLoaded: profileLoaded, save } = useOwnDisplayName({ enabled });
  const { data: familyRows } = useOwnFamilyAccess({ enabled });
  const nameReachesFamily = familyRows && user ? ownNameReachesFamily(familyRows, user.id) : undefined;

  if (
    !user ||
    !profileLoaded ||
    !shouldShowFamilyNamePrompt({ fullName, nameReachesFamily, dismissed: prefs.familyNamePromptDismissed })
  ) {
    return null;
  }

  const trimmed = name.trim();

  return (
    <Card className="border bg-primary/5 border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <UserRound className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
          <div>
            <p id="family-name-title" className="font-sans font-bold text-base leading-snug">
              What should your family call you?
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Shown next to what you log, so everyone knows who did it.
            </p>
          </div>
        </div>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed || save.isPending) return;
            save.mutate(trimmed, {
              onSuccess: () =>
                toast({ title: `Thanks, ${trimmed}`, description: "Your family will see your name next to what you log." }),
            });
          }}
        >
          <Input
            aria-labelledby="family-name-title"
            placeholder="First name"
            autoComplete="given-name"
            maxLength={OWN_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[48px] text-base"
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 touch-target text-sm" disabled={!trimmed || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1 touch-target text-sm"
              onClick={() => setPrefs({ familyNamePromptDismissed: true })}
            >
              Not now
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
