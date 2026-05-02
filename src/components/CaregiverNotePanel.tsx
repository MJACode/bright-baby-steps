import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export function CaregiverNotePanel({ childId }: { childId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data: notes = [] } = useQuery({
    queryKey: ["caregiver-notes", childId],
    queryFn: async () => {
      const { data } = await supabase.from("caregiver_notes")
        .select("id, body, created_at, author_id, read_at")
        .eq("child_id", childId).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!user || !body.trim()) return;
      await supabase.from("caregiver_notes").insert({
        child_id: childId,
        author_id: user.id,
        body: body.trim(),
      });
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["caregiver-notes", childId] });
      toast({ title: "Note sent to parent" });
    },
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Notes for parent
        </p>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Slept poorly, ate well, refused puree…"
        />
        <Button
          size="sm"
          disabled={!body.trim() || send.isPending}
          onClick={() => send.mutate()}
        >
          Send
        </Button>
        <ul className="space-y-2 pt-2 border-t">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <p>{n.body}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
