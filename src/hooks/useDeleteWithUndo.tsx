import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { OFFLINE_LOG_TABLES, submitOfflineLog, type LogRow, type OfflineLogTable } from "@/lib/offlineLogs";

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

// The three log tables go through the offline queue; custom_milestones stays
// online-only.
const isOfflineTable = (table: UndoableTable): table is OfflineLogTable =>
  (OFFLINE_LOG_TABLES as readonly string[]).includes(table);

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
    // Every table this hook supports is a log table, so the canonical list is
    // the floor — callers keep their extra keys on top of it.
    invalidateAfterLogWrite(queryClient);
    invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
  };

  const restore = async (row: TRow) => {
    const payload = { ...row } as Record<string, unknown>;
    STRIP_COLUMNS[table].forEach((col) => delete payload[col]);
    try {
      if (isOfflineTable(table)) {
        // Same id as the deleted row: the queue replays delete → insert in
        // order, and a pending "Waiting to sync" marker stays on the right row.
        const restored = { ...payload, id: row.id } as LogRow;
        await submitOfflineLog(queryClient, {
          action: "insert",
          table,
          rowId: row.id,
          childId: restored.child_id,
          row: restored,
        });
        toast({ title: `${entityLabel} restored` });
        return;
      }
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
    // Log-table deletes queue offline inside submitOfflineLog; this wrapper
    // must not pause with them.
    networkMode: "always",
    mutationFn: async (row: TRow) => {
      if (isOfflineTable(table)) {
        await submitOfflineLog(queryClient, {
          action: "delete",
          table,
          rowId: row.id,
          childId: (row as unknown as { child_id: string }).child_id,
        });
        return row;
      }
      const { error } = await supabase.from(table).delete().eq("id", row.id);
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => {
      // Offline-queue writes refresh the lists when the queue drains.
      if (!isOfflineTable(table)) invalidateAll();
      else invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
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
