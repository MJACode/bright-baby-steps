import { format } from "date-fns";
import { RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import type { Role } from "@/hooks/useCurrentRole";
import { useDeleteFoodAvoidance, useFoodAvoidances, useUpdateFoodAvoidance } from "@/hooks/useFoodAvoidances";
import { avoidanceFoodName, isRetryDue, type FoodAvoidance } from "@/lib/foodAvoidances";
import { cn } from "@/lib/utils";
import {
  AVOID_EMPTY,
  AVOID_OTHER_ROW_TAG,
  AVOID_REASONS,
  AVOID_RETRY_BODY,
  AVOID_RETRY_CONFIRM,
  AVOID_RETRY_DISMISS,
  AVOID_SECTION_HELPER,
  AVOID_SECTION_TITLE,
  avoidRetryConfirmToast,
  avoidRetryTitle,
  type AvoidReason,
} from "@/lib/solidsAvoidCopy";

const REASON_BADGE: Record<AvoidReason, string> = {
  reaction: "bg-warning/15 text-warning border-warning/30",
  preference: "bg-muted text-muted-foreground border-border",
};

// An optimistic "Not for us" row before its insert lands has no server id yet.
const isPending = (row: FoodAvoidance) => row.id.startsWith("pending-");

/**
 * "Foods you're leaving out" on the Solids tab, under the meal plan it filters.
 * Rows show the food, why, and (for editors) a reason picker and a remove
 * button. A "Not a fan yet" row 4 weeks on gets a dismissible "Try again?".
 */
export function FoodAvoidList({ childId, role, roleResolved }: { childId: string; role: Role; roleResolved: boolean }) {
  const { data: rows, isLoading, isError, isFetching, refetch } = useFoodAvoidances(childId);
  const access = { role, roleResolved };
  const update = useUpdateFoodAvoidance(childId, access);
  const remove = useDeleteFoodAvoidance(childId, access);
  const canEdit = roleResolved && role !== "viewer";
  const now = new Date();
  const retryRows = canEdit ? (rows ?? []).filter((r) => !isPending(r) && isRetryDue(r, now)) : [];

  let body;
  if (isLoading) {
    body = (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  } else if (isError && !rows) {
    body = (
      <div className="space-y-2">
        <p className="text-sm leading-relaxed">Your list didn't load. Check your connection and try again.</p>
        <Button type="button" variant="outline" className="touch-target" disabled={isFetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (!rows || rows.length === 0) {
    body = <p className="text-sm leading-relaxed text-muted-foreground">{AVOID_EMPTY}</p>;
  } else {
    body = (
      <ul className="space-y-2">
        {rows.map((row) => {
          const name = avoidanceFoodName(row);
          const busy = isPending(row);
          return (
            <li key={row.id}>
              <Card className="border-0 bg-card">
                <CardContent className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-bold break-words">{name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {!canEdit && (
                        <Badge variant="outline" className={cn("text-xs font-semibold", REASON_BADGE[row.reason])}>
                          {AVOID_REASONS[row.reason].label}
                        </Badge>
                      )}
                      {row.custom_food && (
                        <Badge variant="outline" className="text-xs font-semibold">
                          {AVOID_OTHER_ROW_TAG}
                        </Badge>
                      )}
                    </div>
                    {row.note && <p className="text-xs leading-relaxed text-muted-foreground break-words">{row.note}</p>}
                    <p className="text-xs text-muted-foreground">{format(new Date(row.created_at), "MMM d, yyyy")}</p>
                  </div>
                  {canEdit && (
                    <>
                      <Select
                        value={row.reason}
                        disabled={busy}
                        onValueChange={(next) => {
                          if (next !== row.reason) update.mutate({ id: row.id, patch: { reason: next as AvoidReason } });
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Why ${name} is left out`}
                          className={cn("min-h-[48px] w-auto shrink-0 gap-1 text-sm font-semibold", REASON_BADGE[row.reason])}
                        >
                          <SelectValue>{AVOID_REASONS[row.reason].label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(AVOID_REASONS) as AvoidReason[]).map((reason) => (
                            <SelectItem key={reason} value={reason} className="min-h-[48px]">
                              <span className="block text-sm font-semibold">{AVOID_REASONS[reason].label}</span>
                              <span className="block text-xs text-muted-foreground">{AVOID_REASONS[reason].helper}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${name}`}
                        disabled={busy}
                        onClick={() => remove.mutate({ id: row.id })}
                        className="touch-target shrink-0 text-muted-foreground"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="food-avoid-title">
      <div className="space-y-1">
        <h2 id="food-avoid-title" className="font-display font-bold text-xl">{AVOID_SECTION_TITLE}</h2>
        <p className="text-sm text-muted-foreground">{AVOID_SECTION_HELPER}</p>
      </div>
      {retryRows.map((row) => {
        const name = avoidanceFoodName(row);
        return (
          <Card key={`retry-${row.id}`} className="border-0 bg-feeding-bg">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-base font-bold">
                <RotateCcw className="w-4 h-4 text-feeding" aria-hidden /> {avoidRetryTitle(name)}
              </p>
              <p className="text-sm leading-relaxed">{AVOID_RETRY_BODY}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="touch-target flex-1 bg-feeding font-bold text-white hover:bg-feeding/90"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate({ id: row.id }, { onSuccess: () => toast({ title: avoidRetryConfirmToast(name) }) })
                  }
                >
                  {AVOID_RETRY_CONFIRM}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="touch-target font-semibold"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: row.id, patch: { retryDismissed: true } })}
                >
                  {AVOID_RETRY_DISMISS}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {body}
    </section>
  );
}
