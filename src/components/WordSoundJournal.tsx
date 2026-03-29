import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookHeart, Plus, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface WordSoundJournalProps {
  childId: string;
}

export function WordSoundJournal({ childId }: WordSoundJournalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [wordOrSound, setWordOrSound] = useState("");
  const [context, setContext] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: entries } = useQuery({
    queryKey: ["speech-journal", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("speech_journal" as any)
        .select("*")
        .eq("child_id", childId)
        .order("entry_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: totalCount } = useQuery({
    queryKey: ["speech-journal-count", childId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("speech_journal")
        .select("*", { count: "exact", head: true })
        .eq("child_id", childId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("speech_journal").insert({
        child_id: childId,
        parent_id: user!.id,
        word_or_sound: wordOrSound.trim(),
        context: context.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["speech-journal", childId] });
      queryClient.invalidateQueries({ queryKey: ["speech-journal-count", childId] });
      setWordOrSound("");
      setContext("");
      setShowForm(false);
      toast({ title: "🎉 New word logged! How exciting!" });
    },
    onError: () => {
      toast({ title: "Couldn't save entry", description: "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <BookHeart className="w-5 h-5 text-milestones" /> Word & Sound Journal
        </h2>
        <div className="flex items-center gap-2">
          {totalCount != null && totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              {totalCount} {totalCount === 1 ? "word" : "words"}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="touch-target"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-4 h-4 mr-1" /> Log
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Word or sound (e.g. 'mama', 'babababa')"
              value={wordOrSound}
              onChange={(e) => setWordOrSound(e.target.value)}
              maxLength={100}
            />
            <Textarea
              placeholder="Context — what was happening? (optional)"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              maxLength={500}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => addEntry.mutate()}
                disabled={!wordOrSound.trim() || addEntry.isPending}
              >
                {addEntry.isPending ? "Saving..." : "Save 🌟"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowForm(false); setWordOrSound(""); setContext(""); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id} className="border-0 bg-secondary">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">"{entry.word_or_sound}"</p>
                    {entry.context && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{entry.context}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.entry_date), "MMM d")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 bg-secondary">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Every little sound is a big moment! Tap "Log" to capture your baby's first words 💛
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
