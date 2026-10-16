import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { LOGGED_BY_NAMES_ROOT } from "@/hooks/useLoggedByNames";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ownNameReachesFamily,
  shouldShowFamilyNamePrompt,
  type FamilyAccessRow,
} from "@/lib/familyNamePrompt";

const FAMILY_NAME_MAX_LENGTH = 40;

/**
 * One-time ask for the name family members see on "logged by" chips. Only
 * shows once the profile has loaded with no name AND the name would actually
 * appear to someone: a solo parent never sees attribution, and a partner the
 * owner has already labelled is shown by that label instead.
 */
export function FamilyNamePrompt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { prefs, setPrefs } = usePreferences();
  const [name, setName] = useState("");

  const profileKey = ["profile", user?.id, "full_name"];
  const { data: fullName, isSuccess: profileLoaded } = useQuery({
    queryKey: profileKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.full_name ?? null;
    },
    enabled: !!user && !prefs.familyNamePromptDismissed,
  });

  // Nested under the partner_access root so PartnerManagement's invalidations
  // (invite accepted, partner removed) refresh it too.
  const { data: nameReachesFamily } = useQuery({
    queryKey: ["partner_access", "name-reaches-family", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("owner_id, partner_id, label")
        .or(`owner_id.eq.${user!.id},partner_id.eq.${user!.id}`)
        .eq("status", "active");
      if (error) throw error;
      return ownNameReachesFamily((data ?? []) as FamilyAccessRow[], user!.id);
    },
    enabled: !!user && !prefs.familyNamePromptDismissed,
  });

  const save = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: value })
        .eq("id", user!.id)
        .select("id")
        .single();
      if (error) throw error;
      const { error: authError } = await supabase.auth.updateUser({ data: { full_name: value } });
      if (authError) throw authError;
    },
    onSuccess: (_data, value) => {
      queryClient.setQueryData(profileKey, value);
      queryClient.invalidateQueries({ queryKey: [LOGGED_BY_NAMES_ROOT] });
      toast({ title: `Thanks, ${value}`, description: "Your family will see your name next to what you log." });
    },
    onError: (err: Error) => {
      console.error("Saving family display name failed", err);
      toast({
        title: "We couldn't save your name",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

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
            if (trimmed && !save.isPending) save.mutate(trimmed);
          }}
        >
          <Input
            aria-labelledby="family-name-title"
            placeholder="First name"
            autoComplete="given-name"
            maxLength={FAMILY_NAME_MAX_LENGTH}
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
