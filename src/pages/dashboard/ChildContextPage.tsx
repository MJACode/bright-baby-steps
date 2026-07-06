import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { useChildMemories, type MemoryCategory } from "@/hooks/useChildMemories";
import {
  CHILD_INTERESTS,
  MAX_INTERESTS,
  TEMPERAMENTS,
} from "@/lib/childInterests";
import {
  computeProgress,
  categoryProgress,
} from "@/lib/milestoneProgress";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Plus,
  Check,
  Star,
  Shield,
  ChevronRight,
  X,
} from "lucide-react";

const CATEGORY_ORDER: MemoryCategory[] = [
  "preference",
  "trait",
  "routine",
  "concern",
  "goal",
  "context",
];

const CATEGORY_TITLES: Record<MemoryCategory, string> = {
  preference: "Preferences",
  trait: "Traits",
  routine: "Routines",
  concern: "Concerns",
  goal: "Goals",
  context: "Context",
};

type Memory = ReturnType<typeof useChildMemories>["memories"][number];

function MemoryRow({
  memory,
  onTogglePin,
  onSaveContent,
  onDelete,
  pinPending,
  savePending,
}: {
  memory: Memory;
  onTogglePin: (id: string, next: boolean) => void;
  onSaveContent: (id: string, content: string, onDone: () => void) => void;
  onDelete: (id: string) => void;
  pinPending: boolean;
  savePending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={3}
            className="text-base md:text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="touch-target gap-1.5"
              disabled={savePending}
              onClick={() => onSaveContent(memory.id, draft, () => setEditing(false))}
            >
              <Check className="w-4 h-4" /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="touch-target gap-1.5"
              onClick={() => {
                setDraft(memory.content);
                setEditing(false);
              }}
            >
              <X className="w-4 h-4" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-sm text-foreground leading-relaxed">
            {memory.content}
          </p>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 -my-2 text-muted-foreground hover:text-primary"
              disabled={pinPending}
              aria-label={memory.pinned ? "Unpin" : "Pin"}
              onClick={() => onTogglePin(memory.id, !memory.pinned)}
            >
              {memory.pinned ? (
                <Pin className="w-4 h-4 fill-primary text-primary" />
              ) : (
                <PinOff className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-12 w-12 -my-2 text-muted-foreground hover:text-foreground"
              aria-label="Edit"
              onClick={() => {
                setDraft(memory.content);
                setEditing(true);
              }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 -my-2 text-muted-foreground hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forget this?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Grace Flare will stop using this to personalize suggestions. You
                    can always add it back later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="touch-target">Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="touch-target bg-destructive hover:bg-destructive/90"
                    onClick={() => onDelete(memory.id)}
                  >
                    Forget it
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChildContextPage() {
  const { activeChild, updateChild } = useChildren();

  const [editingInterests, setEditingInterests] = useState(false);
  const [draftInterests, setDraftInterests] = useState<string[]>([]);
  const [draftTemperament, setDraftTemperament] = useState<string | null>(null);

  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("context");

  const childId = activeChild?.id ?? null;
  const ageMonths = activeChild
    ? getAgeInMonths(
        activeChild.date_of_birth,
        activeChild.is_premature ?? false,
        activeChild.due_date,
      )
    : 0;

  const {
    memories,
    isLoading: memoriesLoading,
    togglePin,
    updateContent,
    deleteMemory,
    addManual,
    deleteAllForChild,
  } = useChildMemories(childId);

  const { data: categories } = useQuery({
    queryKey: ["milestone-categories-with-milestones"],
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase
        .from("speech_categories")
        .select("*")
        .order("sort_order");
      if (catError) throw catError;
      const { data: milestones, error: msError } = await supabase
        .from("speech")
        .select("*")
        .order("age_months_typical_start, sort_order");
      if (msError) throw msError;
      return cats.map((cat) => ({
        ...cat,
        milestones: milestones.filter((m) => m.category_id === cat.id),
      }));
    },
  });

  const { data: childMilestones } = useQuery({
    queryKey: ["child-milestones", childId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_speech")
        .select("*")
        .eq("child_id", childId!);
      if (error) throw error;
      return data;
    },
    enabled: !!childId,
  });

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" /> About your baby
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Add a child to see what Grace Flare knows.
          </p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const firstName = activeChild.name.split(" ")[0];
  const childInterests: string[] = (activeChild.interests as string[] | null) ?? [];
  const childTemperament = (activeChild.temperament as string | null) ?? null;
  const hasContextSet = childInterests.length > 0 || childTemperament !== null;

  const interestLabel = (value: string) =>
    CHILD_INTERESTS.find((i) => i.value === value)?.label ?? value;
  const temperamentLabel = (value: string) =>
    TEMPERAMENTS.find((t) => t.value === value)?.label ?? value;

  const startEditInterests = () => {
    setDraftInterests(childInterests);
    setDraftTemperament(childTemperament);
    setEditingInterests(true);
  };

  const toggleDraftInterest = (value: string) => {
    setDraftInterests((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (prev.length >= MAX_INTERESTS) {
        toast({
          title: `Pick up to ${MAX_INTERESTS}`,
          description: "Choose the ones that fit best — you can change these any time.",
        });
        return prev;
      }
      return [...new Set([...prev, value])];
    });
  };

  const saveInterests = () => {
    updateChild.mutate(
      {
        id: activeChild.id,
        interests: draftInterests,
        temperament: draftTemperament,
      },
      {
        onSuccess: () => {
          setEditingInterests(false);
          toast({ title: `Saved — Grace Flare knows ${firstName} a little better now.` });
        },
        onError: (err) =>
          toast({
            title: "Couldn't save that",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleAddMemory = () => {
    addManual.mutate(
      { content: newContent, category: newCategory },
      {
        onSuccess: () => {
          setNewContent("");
          setNewCategory("context");
        },
      },
    );
  };

  const allMilestones = categories?.flatMap((cat) => cat.milestones) ?? [];
  const progress = computeProgress(allMilestones, childMilestones ?? [], ageMonths);
  const catProgress = categoryProgress(allMilestones, childMilestones ?? [], ageMonths);
  const catProgressById = new Map(catProgress.map((c) => [c.categoryId, c]));

  const groupedMemories = CATEGORY_ORDER.map((category) => ({
    category,
    items: memories.filter((m) => m.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" /> About {firstName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          What Grace Flare knows — and how it helps.
        </p>
      </div>

      {/* Interests & temperament */}
      <Card className="border-0 bg-card">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Interests &amp; temperament</h2>
            {!editingInterests && (
              <Button
                variant="ghost"
                size="sm"
                className="touch-target gap-1.5 text-primary"
                onClick={startEditInterests}
              >
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            )}
          </div>

          {editingInterests ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  What does {firstName} love? Pick up to {MAX_INTERESTS}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CHILD_INTERESTS.map((interest) => {
                    const selected = draftInterests.includes(interest.value);
                    return (
                      <button
                        key={interest.value}
                        type="button"
                        onClick={() => toggleDraftInterest(interest.value)}
                        className={cn(
                          "min-h-[48px] rounded-full px-4 text-sm font-semibold transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground hover:bg-muted/70",
                        )}
                      >
                        {interest.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  How would you describe {firstName}?
                </p>
                <div className="flex flex-wrap gap-2">
                  {TEMPERAMENTS.map((temperament) => {
                    const selected = draftTemperament === temperament.value;
                    return (
                      <button
                        key={temperament.value}
                        type="button"
                        onClick={() =>
                          setDraftTemperament(selected ? null : temperament.value)
                        }
                        className={cn(
                          "min-h-[48px] rounded-full px-4 text-sm font-semibold transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground hover:bg-muted/70",
                        )}
                      >
                        {temperament.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  className="touch-target gap-1.5"
                  disabled={updateChild.isPending}
                  onClick={saveInterests}
                >
                  <Check className="w-4 h-4" /> Save
                </Button>
                <Button
                  variant="ghost"
                  className="touch-target"
                  onClick={() => setEditingInterests(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : hasContextSet ? (
            <div className="space-y-3">
              {childInterests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {childInterests.map((value) => (
                    <span
                      key={value}
                      className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
                    >
                      {interestLabel(value)}
                    </span>
                  ))}
                </div>
              )}
              {childTemperament && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">Temperament: </span>
                  <span className="font-semibold">{temperamentLabel(childTemperament)}</span>
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditInterests}
              className="w-full rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-left touch-target"
            >
              <p className="text-sm font-semibold text-primary">
                Tell Grace Flare what {firstName} loves — it sharpens every suggestion.
              </p>
            </button>
          )}
        </CardContent>
      </Card>

      {/* What Grace Flare remembers */}
      <Card className="border-0 bg-card">
        <CardContent className="p-4 space-y-4">
          <h2 className="text-base font-bold">What Grace Flare remembers</h2>

          {memoriesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : groupedMemories.length === 0 ? (
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-sm text-foreground leading-relaxed">
                Nothing remembered yet. As you chat and log, Grace Flare keeps the
                durable stuff — {firstName}'s routines, likes, and quirks — and uses
                it to tailor advice. You're always in control here.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedMemories.map((group) => (
                <div key={group.category} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {CATEGORY_TITLES[group.category]}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((memory) => (
                      <MemoryRow
                        key={memory.id}
                        memory={memory}
                        pinPending={togglePin.isPending}
                        savePending={updateContent.isPending}
                        onTogglePin={(id, next) => togglePin.mutate({ id, next })}
                        onSaveContent={(id, content, onDone) =>
                          updateContent.mutate({ id, content }, { onSuccess: onDone })
                        }
                        onDelete={(id) => deleteMemory.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add something */}
          <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              + Add something we should know
            </p>
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={`e.g. ${firstName} settles fastest with white noise`}
              maxLength={500}
              rows={2}
              className="text-base md:text-sm"
            />
            <div className="flex items-center gap-2">
              <Select
                value={newCategory}
                onValueChange={(v) => setNewCategory(v as MemoryCategory)}
              >
                <SelectTrigger className="w-40 min-h-[48px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_TITLES[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="touch-target gap-1.5"
                disabled={addManual.isPending || newContent.trim().length < 3}
                onClick={handleAddMemory}
              >
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
          </div>

          {/* Forget everything */}
          {groupedMemories.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="touch-target gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" /> Forget everything
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forget everything about {firstName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears every remembered detail for {firstName}. Grace Flare
                    will start fresh and only keep new things from here on. Your logs,
                    milestones, and interests stay untouched. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="touch-target">Keep them</AlertDialogCancel>
                  <AlertDialogAction
                    className="touch-target bg-destructive hover:bg-destructive/90"
                    onClick={() => deleteAllForChild.mutate()}
                  >
                    Forget everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </Card>

      {/* Milestone progress */}
      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-milestones" />
            <h2 className="text-base font-bold">Milestone progress</h2>
          </div>
          <p className="text-sm font-bold text-foreground">
            {progress.achieved} of {progress.total} for this age observed
          </p>
          {catProgress.length > 0 && (
            <div className="space-y-1">
              {categories
                ?.filter((cat) => catProgressById.has(cat.id))
                .map((cat) => {
                  const cp = catProgressById.get(cat.id)!;
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                      <span>{cat.name}</span>
                      <span className="font-semibold text-foreground">
                        {cp.achieved} / {cp.total}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
          <Button asChild variant="outline" className="touch-target gap-1.5 border-milestones/30 text-milestones hover:bg-milestones/10">
            <Link to="/dashboard/milestones">
              Open milestones <ChevronRight className="w-4 h-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* How we use this */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> How we use this
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is the information Grace Flare uses to personalize {firstName}'s
            briefings, chat answers, and Next Steps. It never trains AI models and is
            never used for advertising. You can delete any of it, any time.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="touch-target text-sm">
              <Link to="/dashboard/profile">Manage child data</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="touch-target text-sm text-muted-foreground">
              <Link to="/privacy">Privacy Policy</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
