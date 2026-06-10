import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

type UndoableTable = "sleep_logs" | "feeding_logs" | "diaper_logs" | "custom_milestones";

// Undo re-inserts the deleted row as a fresh row, so server-managed and
// generated columns must be stripped. sleep_logs.duration_minutes is generated
// from (ended_at - started_at) — Postgres rejects an INSERT that supplies it.
const STRIP_COLUMNS: Record<UndoableTable, string[]> = {
  sleep_logs: ["id", "created_at", "updated_at", "duration_minutes"],
  feeding_logs: ["id", "created_at", "updated_at"],
  diaper_logs: ["id", "created_at", "updated_at"],
  custom_milestones: ["id", "created_at", "updated_at"],
};

const UNDO_WINDOW_MS = 5000;

interface UseDeleteWithUndoOptions {
  table: UndoableTable;
  invalidateKeys: QueryKey[];
  entityLabel?: string;
}

export function useDeleteWithUndo<TRow extends { id: string }>({
  table,
  invalidateKeys,
  entityLabel = "Entry",
}: UseDeleteWithUndoOptions) {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
  };

  const restore = async (row: TRow) => {
    const payload = { ...row } as Record<string, unknown>;
    STRIP_COLUMNS[table].forEach((col) => delete payload[col]);
    try {
      const { error } = await supabase.from(table).insert(payload as never);
      if (error) throw error;
      invalidateAll();
      toast({ title: `${entityLabel} restored` });
    } catch (err) {
      toast({
        title: "Couldn't undo",
        description: `${err instanceof Error ? `${err.message} ` : ""}The ${entityLabel.toLowerCase()} stayed deleted — you can add it again from this page.`,
        variant: "destructive",
      });
    }
  };

  return useMutation({
    mutationFn: async (row: TRow) => {
      const { error } = await supabase.from(table).delete().eq("id", row.id);
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => {
      invalidateAll();
      toast({
        title: `${entityLabel} deleted`,
        duration: UNDO_WINDOW_MS,
        action: (
          <ToastAction altText={`Undo deleting this ${entityLabel.toLowerCase()}`} className="touch-target" onClick={() => void restore(row)}>
            Undo
          </ToastAction>
        ),
      });
    },
    onError: (err) => {
      toast({
        title: `Couldn't delete ${entityLabel.toLowerCase()}`,
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });
}
