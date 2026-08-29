// "What Grace Flare remembers" — the audit-and-control surface for the
// per-child personalization inputs that `loadMemoryContext` injects into the
// briefing, weekly-insights, next-step-peek, activity-plan and journal prompts.
//
// Reached from Profile and from the AI surfaces themselves (Weekly insights),
// not from the More list — this is a settings screen you visit when you wonder
// "how did it know that?", not something you browse.
//
// Interests + temperament are edited through AddChildDialog's existing edit
// mode rather than a second editor; this page only shows them and opens it.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useChildren } from "@/hooks/useChildren";
import { useChildMemories } from "@/hooks/useChildMemories";
import { CHILD_INTERESTS, TEMPERAMENTS } from "@/lib/childInterests";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Sparkles,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Plus,
  Check,
  Shield,
  MoreVertical,
  X,
} from "lucide-react";

type Memory = ReturnType<typeof useChildMemories>["memories"][number];

function MemoryRow({
  memory,
  onTogglePin,
  onSaveContent,
  onRequestDelete,
  pinPending,
  savePending,
}: {
  memory: Memory;
  onTogglePin: (id: string, next: boolean) => void;
  onSaveContent: (id: string, content: string, onDone: () => void) => void;
  onRequestDelete: (memory: Memory) => void;
  pinPending: boolean;
  savePending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  if (editing) {
    return (
      <div className="rounded-xl bg-muted/40 p-3 space-y-2">
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
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-3">
      {memory.pinned && (
        <Pin className="w-4 h-4 mt-0.5 shrink-0 fill-primary text-primary" />
      )}
      <p className="flex-1 min-w-0 text-sm text-foreground leading-relaxed">
        {memory.content}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 -my-2 -mr-1 shrink-0 text-muted-foreground"
            aria-label="Options for this detail"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="gap-2"
            disabled={pinPending}
            onSelect={() => onTogglePin(memory.id, !memory.pinned)}
          >
            {memory.pinned ? (
              <>
                <PinOff className="w-4 h-4" /> Unpin
              </>
            ) : (
              <>
                <Pin className="w-4 h-4" /> Keep pinned
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              setDraft(memory.content);
              setEditing(true);
            }}
          >
            <Pencil className="w-4 h-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onSelect={() => onRequestDelete(memory)}
          >
            <Trash2 className="w-4 h-4" /> Forget
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function ChildContextPage() {
  const { activeChild } = useChildren();

  const [editingChild, setEditingChild] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Memory | null>(null);

  const {
    memories,
    isLoading: memoriesLoading,
    togglePin,
    updateContent,
    deleteMemory,
    addManual,
    deleteAllForChild,
  } = useChildMemories(activeChild?.id ?? null);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" /> What Grace Flare remembers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Add a child to see what personalizes their suggestions.
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

  const handleAddMemory = () => {
    // Manual notes go in as `context` — the six-way category split is an
    // extraction detail the AI uses, not something to make a parent classify.
    addManual.mutate(
      { content: newContent, category: "context" },
      {
        onSuccess: () => {
          setNewContent("");
          setAdding(false);
        },
      },
    );
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" /> What Grace Flare remembers
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          The details behind {firstName}'s briefings, insights, and Next Steps. Edit
          or delete any of them.
        </p>
      </div>

      {/* Interests & temperament — display only; editing reuses AddChildDialog */}
      <Card className="border-0 bg-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Interests &amp; temperament</h2>
            {hasContextSet && (
              <Button
                variant="ghost"
                size="sm"
                className="touch-target gap-1.5 text-primary"
                onClick={() => setEditingChild(true)}
              >
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            )}
          </div>

          {hasContextSet ? (
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
              onClick={() => setEditingChild(true)}
              className="w-full rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-left touch-target"
            >
              <p className="text-sm font-semibold text-primary">
                Tell Grace Flare what {firstName} loves — it sharpens every suggestion.
              </p>
            </button>
          )}
        </CardContent>
      </Card>

      {/* Remembered details */}
      <Card className="border-0 bg-card">
        <CardContent className="p-4 space-y-4">
          <h2 className="text-base font-bold">Remembered details</h2>

          {memoriesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : memories.length === 0 ? (
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-sm text-foreground leading-relaxed">
                Nothing remembered yet. As you log, Grace Flare keeps the durable
                stuff — {firstName}'s routines, likes, and quirks — and uses it to
                tailor advice. You're always in control here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {memories.map((memory) => (
                <MemoryRow
                  key={memory.id}
                  memory={memory}
                  pinPending={togglePin.isPending}
                  savePending={updateContent.isPending}
                  onTogglePin={(id, next) => togglePin.mutate({ id, next })}
                  onSaveContent={(id, content, onDone) =>
                    updateContent.mutate({ id, content }, { onSuccess: onDone })
                  }
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </div>
          )}

          {/* Add something — collapsed until asked for */}
          {adding ? (
            <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={`e.g. ${firstName} settles fastest with white noise`}
                maxLength={500}
                rows={2}
                autoFocus
                className="text-base md:text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  className="touch-target gap-1.5"
                  disabled={addManual.isPending || newContent.trim().length < 3}
                  onClick={handleAddMemory}
                >
                  <Check className="w-4 h-4" /> Save
                </Button>
                <Button
                  variant="ghost"
                  className="touch-target gap-1.5"
                  onClick={() => {
                    setNewContent("");
                    setAdding(false);
                  }}
                >
                  <X className="w-4 h-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="touch-target gap-1.5 w-full"
              onClick={() => setAdding(true)}
            >
              <Plus className="w-4 h-4" /> Add something we should know
            </Button>
          )}

          {memories.length > 0 && (
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

      {/* How we use this */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> How we use this
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is the information Grace Flare uses to personalize {firstName}'s
            briefings, insights, and Next Steps. It never trains AI models and is
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

      {/* Single confirm dialog for the row menus — kept outside the menu so the
          dropdown's focus trap doesn't fight the alert's. */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget this?</AlertDialogTitle>
            <AlertDialogDescription>
              Grace Flare will stop using this to personalize suggestions. You can
              always add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="touch-target bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteMemory.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Forget it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingChild && (
        <AddChildDialog
          child={activeChild}
          open={editingChild}
          onOpenChange={setEditingChild}
        />
      )}
    </div>
  );
}
