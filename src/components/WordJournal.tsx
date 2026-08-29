import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookHeart, Plus, Sparkles, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { SpeechInsightsPanel } from "@/components/SpeechInsightsPanel";

interface WordJournalProps {
  childId: string;
  childName?: string;
  ageMonths?: number;
}

export function WordJournal({ childId, childName = "Baby", ageMonths = 0 }: WordJournalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editContext, setEditContext] = useState("");

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
        .from("speech_journal" as any)
        .select("*", { count: "exact", head: true })
        .eq("child_id", childId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      // `word_or_sound` is the original column name from the 2026-03 migration.
      // The journal tracks words only as of 2026-08-29; the column keeps its name
      // so existing rows, the weekly-insights function, and Speech Class stay intact.
      const { error } = await supabase.from("speech_journal" as any).insert({
        child_id: childId,
        parent_id: user!.id,
        word_or_sound: word.trim(),
        context: context.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["speech-journal", childId] });
      queryClient.invalidateQueries({ queryKey: ["speech-journal-count", childId] });
      setWord("");
      setContext("");
      setShowForm(false);
      toast({ title: "🎉 New word logged! How exciting!" });
    },
    onError: () => {
      toast({ title: "Couldn't save entry", description: "Please try again.", variant: "destructive" });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("speech_journal" as any)
        .update({ word_or_sound: editWord.trim(), context: editContext.trim() || null })
        .eq("id", editingId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["speech-journal", childId] });
      setEditingId(null);
      setEditWord("");
      setEditContext("");
      toast({ title: "Entry updated!" });
    },
    onError: () => {
      toast({ title: "Couldn't update entry", description: "Please try again.", variant: "destructive" });
    },
  });

  const openEdit = (entry: any) => {
    setEditingId(entry.id);
    setEditWord(entry.word_or_sound);
    setEditContext(entry.context || "");
    setShowForm(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <BookHeart className="w-5 h-5 text-milestones" /> Word Journal
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
            onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          >
            <Plus className="w-4 h-4 mr-1" /> Log
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-0 bg-milestones-bg">
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Word (e.g. 'mama', 'more', 'doggy')"
              value={word}
              onChange={(e) => setWord(e.target.value)}
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
                disabled={!word.trim() || addEntry.isPending}
              >
                {addEntry.isPending ? "Saving..." : "Save 🌟"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowForm(false); setWord(""); setContext(""); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <SpeechInsightsPanel
        entries={entries}
        totalCount={totalCount ?? 0}
        ageMonths={ageMonths}
        childId={childId}
        childName={childName}
      />

      {entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id} className="border-0 bg-secondary">
              <CardContent className="p-3">
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editWord}
                      onChange={(e) => setEditWord(e.target.value)}
                      maxLength={100}
                    />
                    <Textarea
                      placeholder="Context (optional)"
                      value={editContext}
                      onChange={(e) => setEditContext(e.target.value)}
                      maxLength={500}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateEntry.mutate()}
                        disabled={!editWord.trim() || updateEntry.isPending}
                      >
                        {updateEntry.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingId(null); setEditWord(""); setEditContext(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm">"{entry.word_or_sound}"</p>
                      {entry.context && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{entry.context}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(parseISO(entry.entry_date), "MMM d")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-milestones"
                        onClick={() => openEdit(entry)}
                        aria-label="Edit entry"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 bg-secondary">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Every new word is a big moment! Tap "Log" to capture your baby's first words 💛
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
