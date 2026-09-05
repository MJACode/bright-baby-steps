import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CloudMoon, Moon, Pencil, Plus, Sun, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { useLogHistory } from "@/hooks/useLogHistory";
import { useLoggedByNames } from "@/hooks/useLoggedByNames";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { badgeVariants } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddChildDialog } from "@/components/AddChildDialog";
import { MobileDateTimePicker } from "@/components/MobileDateTimePicker";
import { GroupedLogList } from "@/components/logging/GroupedLogList";
import { LoggedByChip } from "@/components/LoggedByChip";
import { cancelSessionNotification } from "@/lib/sessionNotifications";
import { invalidateAfterLogWrite } from "@/lib/logInvalidation";
import { formatDurationShort } from "@/lib/sessionAnchor";
import { summarizeSleepDay } from "@/lib/logDaySummary";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type SleepLogRow = Tables<"sleep_logs">;

export default function SleepHistoryPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // History rows can be older than any cached window, so the delete path can't
  // look the row back up by id — hold onto the row itself.
  const [editingRow, setEditingRow] = useState<SleepLogRow | null>(null);
  const [editSleepType, setEditSleepType] = useState<"nap" | "night">("nap");
  const [editStartedAt, setEditStartedAt] = useState<Date>(new Date());
  const [editEndedAt, setEditEndedAt] = useState<Date>(new Date());

  const history = useLogHistory<SleepLogRow>({
    table: "sleep_logs",
    childId: activeChild?.id,
    dateColumn: "started_at",
  });

  const loggedByNames = useLoggedByNames(history.logs.map((l) => l.parent_id));

  // Every close converges here — a stray `setEditDialogOpen(false)` would leave
  // `editingId` set and the next open would UPDATE the previous row.
  const closeDialog = () => {
    setEditDialogOpen(false);
    setEditingId(null);
    setEditingRow(null);
  };

  const updateLog = useMutation({
    mutationFn: async () => {
      const startDate = editStartedAt;
      const endDate = editEndedAt;

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("Please enter valid start and end times.");
      }

      if (endDate <= startDate) {
        throw new Error("End time must be after start time.");
      }

      const payload = {
        sleep_type: editSleepType,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from("sleep_logs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sleep_logs").insert({
          ...payload,
          child_id: activeChild!.id,
          parent_id: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateAfterLogWrite(queryClient);
      closeDialog();
      toast({ title: editingId ? "Sleep log updated! ✏️" : "Sleep logged! 😴" });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save sleep log",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLog = useDeleteWithUndo<SleepLogRow>({
    table: "sleep_logs",
    invalidateKeys: [["sleep-logs"], ["sleep-today-logs"], ["activity-feed"]],
  });

  const handleDelete = () => {
    const row = editingRow;
    if (!row) return;
    closeDialog();
    deleteLog.mutate(row, {
      onSuccess: () => {
        // Deleting an in-progress timer session must also cancel its scheduled
        // "still sleeping?" notification, same as useActiveSleep's cancel path.
        if (!row.ended_at && row.source === "timer") void cancelSessionNotification(row.id);
      },
    });
  };

  const openAdd = () => {
    setEditingId(null);
    setEditingRow(null);
    setEditSleepType("nap");
    setEditStartedAt(new Date(Date.now() - 30 * 60 * 1000));
    setEditEndedAt(new Date());
    setEditDialogOpen(true);
  };

  const openEdit = (log: SleepLogRow) => {
    setEditingId(log.id);
    setEditingRow(log);
    setEditSleepType(log.sleep_type as "nap" | "night");
    setEditStartedAt(new Date(log.started_at));
    setEditEndedAt(log.ended_at ? new Date(log.ended_at) : new Date());
    setEditDialogOpen(true);
  };

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Moon className="w-7 h-7 text-sleep" /> Sleep history
        </h1>
        <p className="text-muted-foreground text-sm">Add a child to start tracking sleep.</p>
        <AddChildDialog />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Moon className="w-7 h-7 text-sleep" /> Sleep history
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Every nap and night sleep for {activeChild.name}.</p>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={openAdd}
        className="w-full touch-target gap-1.5 text-sleep border-sleep/30 hover:bg-sleep-bg"
      >
        <Plus className="w-4 h-4" /> Log a sleep
      </Button>

      <GroupedLogList<SleepLogRow>
        logs={history.logs}
        isLoading={history.isLoading}
        isError={history.isError}
        hasEarlier={history.hasEarlier}
        truncated={history.truncated}
        onShowEarlier={history.showEarlier}
        onRetry={history.refetch}
        getDate={(log) => log.started_at}
        schedule={history.schedule}
        summarize={summarizeSleepDay}
        labels={{ unit: "sleep", unitPlural: "sleeps" }}
        renderRow={(log) => {
          const minutes = log.duration_minutes || 0;
          const typeLabel = log.sleep_type === "nap" ? "nap" : "night sleep";
          return (
            <Card key={log.id} className="border-0 bg-sleep-bg">
              <button
                type="button"
                onClick={() => openEdit(log)}
                aria-label={`Edit ${typeLabel}, ${minutes} minutes, ${format(new Date(log.started_at), "h:mm a")}`}
                className="touch-target w-full rounded-2xl p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-sleep/10 motion-reduce:transition-none"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className={cn(badgeVariants({ variant: "secondary" }), "shrink-0")}>
                    {log.sleep_type === "nap" ? "☀️ Nap" : "🌙 Night"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {formatDurationShort(minutes)}
                    </span>
                    <span className="block text-xs text-foreground/75">
                      {format(new Date(log.started_at), "h:mm a")}
                    </span>
                    <LoggedByChip name={loggedByNames[log.parent_id]} className="mt-0.5" />
                  </span>
                </span>
                <Pencil aria-hidden className="w-4 h-4 shrink-0 text-muted-foreground" />
              </button>
            </Card>
          );
        }}
        emptyState={
          <Card className="border-0 bg-sleep-bg">
            <CardContent className="p-4 flex flex-col items-center justify-center py-8 gap-3">
              <CloudMoon className="w-10 h-10 text-sleep/40" />
              <p className="text-sm text-muted-foreground text-center">
                Every nap and night sleep you log will show up here.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={openAdd}
                className="gap-1.5 text-sleep border-sleep/30 hover:bg-sleep-bg touch-target"
              >
                <Plus className="w-4 h-4" /> Log a first sleep
              </Button>
            </CardContent>
          </Card>
        }
      />

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => (open ? setEditDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingId ? "Edit Sleep Log" : "Log Sleep"}
            </DialogTitle>
            <DialogDescription>Set start and end time, then save changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={editSleepType === "nap" ? "default" : "outline"}
                onClick={() => setEditSleepType("nap")}
                className="flex-1 touch-target gap-2"
              >
                <Sun className="w-5 h-5" /> Nap
              </Button>
              <Button
                type="button"
                variant={editSleepType === "night" ? "default" : "outline"}
                onClick={() => setEditSleepType("night")}
                className="flex-1 touch-target gap-2"
              >
                <Moon className="w-5 h-5" /> Night
              </Button>
            </div>
            <MobileDateTimePicker
              label="Start Time"
              value={editStartedAt}
              onChange={setEditStartedAt}
              maxDate={new Date()}
            />
            <MobileDateTimePicker
              label="End Time"
              value={editEndedAt}
              onChange={setEditEndedAt}
              maxDate={new Date()}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 touch-target"
                onClick={closeDialog}
                disabled={updateLog.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => updateLog.mutate()}
                className="flex-1 touch-target bg-sleep hover:bg-sleep/90 text-white"
                disabled={updateLog.isPending}
              >
                {updateLog.isPending
                  ? "Saving..."
                  : editingId
                    ? "Update Sleep Log"
                    : "Save Sleep Log"}
              </Button>
            </div>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                className="w-full touch-target gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={updateLog.isPending || deleteLog.isPending}
              >
                <Trash2 className="w-4 h-4" /> Delete entry
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
