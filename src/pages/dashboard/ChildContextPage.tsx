// "What Grace Flare remembers" — the control surface for the per-child
// personalization inputs that `loadMemoryContext` injects into the
// briefing, weekly-insights, and visit-prep prompts.
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
import { Sparkles, Pencil, Trash2, Shield } from "lucide-react";

export default function ChildContextPage() {
  const { activeChild } = useChildren();

  const [editingChild, setEditingChild] = useState(false);

  const { deleteAllForChild } = useChildMemories(activeChild?.id ?? null);

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

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" /> What Grace Flare remembers
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          The details behind {firstName}'s briefings, insights, and Visit Prep.
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

      {/* Notes are deliberately not listed here; parents see them via the data export */}
      <Card className="border-0 bg-card">
        <CardContent className="p-4 space-y-3">
          <h2 className="text-base font-bold">Background details</h2>
          <p className="text-sm text-foreground leading-relaxed">
            Grace Flare also keeps short notes from {firstName}'s briefings and
            weekly insights, plus your sleep plan summary — things like routines
            and what helps them settle — to tailor suggestions. They're included
            in your data export.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="touch-target gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={deleteAllForChild.isPending}
              >
                <Trash2 className="w-4 h-4" /> Forget everything
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forget everything about {firstName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears every background note Grace Flare has kept about{" "}
                  {firstName}. It will start fresh and only keep new things from
                  here on. Your logs, milestones, and interests stay untouched. This
                  can't be undone.
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
            briefings, insights, and Visit Prep. It never trains AI models and is never used
            for advertising. You can delete any of it, any time.
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
