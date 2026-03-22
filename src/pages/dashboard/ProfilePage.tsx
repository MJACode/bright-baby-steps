import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User, LogOut, Baby, StickyNote, Save } from "lucide-react";
import PediatricianExport from "@/components/PediatricianExport";
import { toast } from "@/hooks/use-toast";

const STORAGE_KEY = "pediatrician_notes";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children } = useChildren();
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY}_${user?.id}`);
    if (stored) setNotes(stored);
  }, [user?.id]);

  const saveNotes = () => {
    if (user?.id) {
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, notes);
      setSaved(true);
      toast({ title: "Notes saved ✓" });
    }
  };

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

      {/* Pediatrician Notes */}
      <Card className="border-0 bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="w-4 h-4" /> Pediatrician Reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Jot down things you don't want to forget to mention at your next visit. These will be included in your PDF report.
          </p>
          <Textarea
            placeholder="e.g. Ask about rash on left arm, discuss sleep regression, vaccine schedule question..."
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            className="min-h-[100px] text-sm"
          />
          <Button
            size="sm"
            onClick={saveNotes}
            disabled={saved}
            className="gap-1.5"
          >
            <Save className="w-3.5 h-3.5" /> {saved ? "Saved" : "Save Notes"}
          </Button>
        </CardContent>
      </Card>

      {/* Pediatrician Export */}
      <PediatricianExport pediatricianNotes={notes} />

      {/* Sign out */}
      <Button variant="outline" onClick={signOut} className="w-full gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  );
}