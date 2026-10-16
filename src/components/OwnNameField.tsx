import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { OWN_NAME_MAX_LENGTH, useOwnDisplayName, useOwnFamilyAccess } from "@/hooks/useOwnDisplayName";
import { toast } from "@/hooks/use-toast";
import { ownPartnerLabel } from "@/lib/familyNamePrompt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function OwnNameField() {
  const { user } = useAuth();
  const { fullName, isLoaded, save } = useOwnDisplayName();
  const { data: familyRows } = useOwnFamilyAccess();
  const [name, setName] = useState("");

  // Prefill once the saved name arrives, and again after a save lands.
  useEffect(() => {
    if (isLoaded) setName(fullName ?? "");
  }, [isLoaded, fullName]);

  const trimmed = name.trim();
  const canSave = isLoaded && !!trimmed && trimmed !== (fullName ?? "").trim() && !save.isPending;
  const label = familyRows && user ? ownPartnerLabel(familyRows, user.id) : null;

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        save.mutate(trimmed, { onSuccess: () => toast({ title: "Name saved" }) });
      }}
    >
      <Label htmlFor="own-name" className="text-sm font-semibold">Your name</Label>
      <div className="flex gap-2">
        <Input
          id="own-name"
          autoComplete="given-name"
          maxLength={OWN_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isLoaded}
          aria-describedby="own-name-help"
          className="min-h-[48px] text-base"
        />
        <Button type="submit" className="touch-target text-sm" disabled={!canSave}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p id="own-name-help" className="text-xs text-muted-foreground">
        Shown next to what you log, so your family knows who did it.
      </p>
      {label && (
        <p className="text-xs text-muted-foreground">
          Your family sees you as “{label}”, set by the account owner.
        </p>
      )}
    </form>
  );
}
