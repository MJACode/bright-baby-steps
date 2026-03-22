import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { User, LogOut, Baby, StickyNote, Plus, Trash2 } from "lucide-react";
import PediatricianExport from "@/components/PediatricianExport";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ReminderNote {
  id: string;
  text: string;
  createdAt: string;
  includeInReport: boolean;
}

const STORAGE_KEY = "pediatrician_reminders";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children } = useChildren();
  const [draft, setDraft] = useState("");
  const [reminders, setReminders] = useState<ReminderNote[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const stored = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (stored) {
      try { setReminders(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, [user?.id]);

  const persist = (updated: ReminderNote[]) => {
    setReminders(updated);
    if (user?.id) localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(updated));
  };

  const addReminder = () => {
    if (!draft.trim()) return;
    const note: ReminderNote = {
      id: crypto.randomUUID(),
      text: draft.trim(),
      createdAt: new Date().toISOString(),
      includeInReport: true,
    };
    persist([note, ...reminders]);
    setDraft("");
    toast({ title: "Reminder added ✓" });
  };

  const toggleInclude = (id: string) => {
    persist(reminders.map((r) => r.id === id ? { ...r, includeInReport: !r.includeInReport } : r));
  };

  const removeReminder = (id: string) => {
    persist(reminders.filter((r) => r.id !== id));
  };

  const reportNotes = reminders
    .filter((r) => r.includeInReport)
    .map((r) => r.text)
    .join("\n• ");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <User className="w-7 h-7 text-primary" /> Profile & Settings
        </h1>
      </div>

      {/* Account info */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">{user?.email}</p>
          {children.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Baby className="w-4 h-4" />
              {children.map((c) => c.name).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pediatrician Reminders */}
      <Card className="border-0 bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="w-4 h-4" /> Pediatrician Reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add things you don't want to forget at your next visit. Check the ones to include in your PDF report.
          </p>
          <div className="flex gap-2">
            <Textarea
              placeholder="e.g. Ask about rash on left arm..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[60px] text-sm flex-1"
            />
            <Button size="sm" onClick={addReminder} disabled={!draft.trim()} className="self-end gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          {reminders.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              {reminders.map((r) => (
                <div key={r.id} className="flex items-start gap-2 group">
                  <Checkbox
                    checked={r.includeInReport}
                    onCheckedChange={() => toggleInclude(r.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{r.text}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(r.createdAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => removeReminder(r.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pediatrician Export */}
      <PediatricianExport pediatricianNotes={reportNotes ? `• ${reportNotes}` : ""} />

      {/* Sign out */}
      <Button variant="outline" onClick={signOut} className="w-full gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  );
}
