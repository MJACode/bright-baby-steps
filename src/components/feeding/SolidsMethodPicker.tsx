import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useChildren } from "@/hooks/useChildren";
import { assertCanWrite, ROLE_UNRESOLVED_MESSAGE, VIEW_ONLY_MESSAGE, type Role } from "@/hooks/useCurrentRole";
import type { SolidsMethod } from "@/lib/mealPlan";
import { SOLIDS_METHOD_OPTIONS, solidsMethodLabel } from "@/lib/mealPlanCopy";

export const SOLIDS_METHOD_SAVE_ERROR =
  "Your feeding style didn't save. Check your connection and pick it again.";

function describeSaveError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  // .single() on an RLS-filtered UPDATE comes back as PGRST116 (0 rows).
  if (e?.code === "42501" || e?.code === "PGRST116") {
    return "Only parents and caregivers who can edit can change the feeding style.";
  }
  if (err instanceof Error && !e?.code && (err.message === VIEW_ONLY_MESSAGE || err.message === ROLE_UNRESOLVED_MESSAGE)) return err.message;
  return SOLIDS_METHOD_SAVE_ERROR;
}

export function SolidsMethodPicker({
  childId,
  method,
  role,
  roleResolved,
}: {
  childId: string;
  method: SolidsMethod | null;
  role: Role;
  roleResolved: boolean;
}) {
  const { updateChild } = useChildren();
  const [editing, setEditing] = useState(false);
  const canEdit = roleResolved && role !== "viewer";

  const choose = (value: SolidsMethod) => {
    if (value === method) {
      setEditing(false);
      return;
    }
    try {
      assertCanWrite(roleResolved, role);
    } catch (err) {
      toast({ title: describeSaveError(err), variant: "destructive" });
      return;
    }
    updateChild.mutate(
      { id: childId, solids_method: value },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast({ title: describeSaveError(err), variant: "destructive" }),
      },
    );
  };

  if (method && !editing) {
    if (!canEdit) {
      return (
        <p className="text-sm font-semibold text-muted-foreground">
          Feeding style: <span className="text-foreground">{solidsMethodLabel(method)}</span>
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Feeding style: ${solidsMethodLabel(method)}. Change`}
        className="touch-target inline-flex items-center gap-1.5 rounded-full bg-feeding-bg px-4 text-sm font-semibold text-feeding"
      >
        {solidsMethodLabel(method)}
        <Pencil className="w-3.5 h-3.5" aria-hidden />
      </button>
    );
  }

  if (!canEdit) return null;

  return (
    <section aria-labelledby="solids-method-heading" className="space-y-3">
      <div>
        <h2 id="solids-method-heading" className="font-display text-xl font-bold">
          How does your baby eat solids?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">This shapes your meal ideas. You can change it anytime.</p>
      </div>
      <div className="space-y-2" role="group" aria-label="Feeding style">
        {SOLIDS_METHOD_OPTIONS.map((option) => {
          const selected = option.value === method;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={updateChild.isPending}
              onClick={() => choose(option.value)}
              className={cn(
                "touch-target flex w-full items-center gap-3 rounded-xl border-2 bg-card p-4 text-left transition-colors disabled:opacity-60",
                selected ? "border-feeding bg-feeding-bg" : "border-border hover:border-feeding/50",
              )}
            >
              <span className="flex-1">
                <span className="block text-base font-bold">{option.label}</span>
                <span className="block text-sm text-muted-foreground">{option.description}</span>
              </span>
              {selected && <Check className="w-5 h-5 shrink-0 text-feeding" aria-hidden />}
            </button>
          );
        })}
      </div>
      {method && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="touch-target text-sm font-semibold text-muted-foreground"
        >
          Keep {solidsMethodLabel(method)}
        </button>
      )}
    </section>
  );
}
