import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkAndRequestVpc, type VpcGateStatus } from "@/lib/vpcGate";
import { VpcGateMessage } from "@/components/VpcGateMessage";
import { CoppaDirectNotice } from "@/components/CoppaDirectNotice";
import { RetroactiveMilestoneCatchUp } from "@/components/onboarding/RetroactiveMilestoneCatchUp";

interface ChildData {
  id: string;
  name: string;
  date_of_birth: string;
  gender?: string | null;
  is_premature?: boolean | null;
  due_date?: string | null;
  is_expected?: boolean | null;
}

interface AddChildDialogProps {
  trigger?: React.ReactNode;
  /** Pass an existing child to open in edit mode */
  child?: ChildData;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddChildDialog({ trigger, child, open: controlledOpen, onOpenChange }: AddChildDialogProps) {
  const isEditMode = !!child;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [isPremature, setIsPremature] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [isExpected, setIsExpected] = useState(false);
  const [vpcStatus, setVpcStatus] = useState<VpcGateStatus | null>(null);
  const [checkingVpc, setCheckingVpc] = useState(false);
  const [directNoticeAck, setDirectNoticeAck] = useState<boolean | null>(null);
  // After a backdated (>=1mo) child is added, open the catch-up modal so the
  // parent can mark already-reached milestones instead of seeing red flags.
  const [catchUpChild, setCatchUpChild] = useState<{ id: string; name: string; ageMonths: number } | null>(null);

  const { addChild, updateChild } = useChildren();
  const { user } = useAuth();

  // Read whether the parent has already acknowledged the COPPA direct notice
  // (16 CFR § 312.4(c)). Required only when adding a new child; edit mode skips.
  useEffect(() => {
    if (!open || isEditMode || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("coppa_direct_notice_acknowledged_at")
        .eq("id", user.id)
        .maybeSingle<{ coppa_direct_notice_acknowledged_at: string | null }>();
      if (!cancelled) setDirectNoticeAck(!!data?.coppa_direct_notice_acknowledged_at);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isEditMode, user]);

  // Pre-fill form when editing. Key on child.id (not the whole object) so a
  // react-query refetch returning a new array reference doesn't wipe the
  // user's in-flight edits.
  useEffect(() => {
    if (child && open) {
      setName(child.name);
      setDob(child.date_of_birth);
      setGender(child.gender ?? "");
      setIsPremature(child.is_premature ?? false);
      setDueDate(child.due_date ?? "");
      setIsExpected(child.is_expected ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child?.id, open]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!dob) {
      toast({ title: "Date of birth is required", variant: "destructive" });
      return;
    }

    // COPPA email-plus VPC gate: only required when CREATING a new child.
    // Edit mode bypasses (the child already exists; the original VPC covers it).
    if (!isEditMode && user) {
      setCheckingVpc(true);
      try {
        const status = await checkAndRequestVpc(user.id);
        if (status.kind !== "completed") {
          setVpcStatus(status);
          setCheckingVpc(false);
          return;
        }
      } finally {
        setCheckingVpc(false);
      }
    }

    // Determine if the entered date is in the future → auto-set is_expected
    const isDateInFuture = new Date(dob) > new Date();
    const expectedFlag = isExpected || isDateInFuture;

    // Send null (not undefined) so cleared fields actually clear server-side.
    // supabase-js drops undefined keys from the payload before sending.
    const payload = {
      name: name.trim(),
      date_of_birth: dob,
      gender: gender || null,
      is_premature: expectedFlag ? false : isPremature,
      due_date: !expectedFlag && isPremature && dueDate ? dueDate : null,
      is_expected: expectedFlag,
    };

    try {
      if (isEditMode && child) {
        await updateChild.mutateAsync({ id: child.id, ...payload });
        toast({ title: "Saved! ✏️", description: `${name}'s profile has been updated.` });
      } else {
        const newChild = await addChild.mutateAsync(payload);
        if (!newChild?.id) {
          toast({ title: "Error", description: "Couldn't read back the new child row.", variant: "destructive" });
          return;
        }
        toast({ title: "Child added! 🌱", description: `${name} has been added to your profile.` });

        // For backdated DOBs, open the catch-up modal so red flags don't fire
        // for milestones the parent never had a chance to log. Expected babies
        // (future DOB) and newborns (<1mo) skip the catch-up.
        if (!expectedFlag) {
          const newAgeMonths = getAgeInMonths(
            dob,
            isPremature,
            isPremature && dueDate ? dueDate : null
          );
          if (newAgeMonths >= 1) {
            setCatchUpChild({ id: newChild.id, name: name.trim(), ageMonths: newAgeMonths });
          } else {
            // Newborn — stamp so the dashboard banner never fires. If this
            // stamp fails the parent sees a soft warning; the banner only
            // appears for 14 days even if the stamp never lands.
            const { error: stampError } = await supabase
              .from("children")
              .update({ retroactive_setup_completed_at: new Date().toISOString() })
              .eq("id", newChild.id);
            if (stampError) {
              toast({
                title: "Couldn't finalize setup",
                description: "We saved the child but couldn't dismiss the milestone catch-up banner. You can dismiss it from the Milestones tab.",
                variant: "destructive",
              });
            }
          }
        }
      }
      setOpen(false);
      if (!isEditMode) {
        setName(""); setDob(""); setGender(""); setIsPremature(false); setDueDate(""); setIsExpected(false);
      }
    } catch (err) {
      console.error("Could not save child", err);
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const isFutureDob = dob ? new Date(dob) > new Date() : false;

  const showDirectNotice = !isEditMode && user && directNoticeAck === false;

  const content = (
    <DialogContent className="max-w-sm mx-auto">
      <DialogHeader>
        <DialogTitle className="font-display">{isEditMode ? "Edit Child" : "Add a Child"}</DialogTitle>
      </DialogHeader>
      {showDirectNotice ? (
        <CoppaDirectNotice
          userId={user.id}
          onAcknowledged={() => setDirectNoticeAck(true)}
          onCancel={() => setOpen(false)}
        />
      ) : (
      <>
      {vpcStatus && vpcStatus.kind !== "completed" && (
        <div className="mb-2">
          <VpcGateMessage status={vpcStatus} onDismiss={() => setVpcStatus(null)} />
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Baby's name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dob">{isFutureDob ? "Expected Due Date" : "Date of Birth"}</Label>
          <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
          {isFutureDob && (
            <p className="text-xs text-muted-foreground">
              Future date detected — we'll treat this as an expected baby. You can update the date once your baby arrives.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Gender (optional)</Label>
          <div className="flex gap-2">
            {[
              { value: "male", label: "Boy" },
              { value: "female", label: "Girl" },
              { value: "other", label: "Other" },
            ].map((g) => (
              <Button key={g.value} type="button" variant={gender === g.value ? "default" : "outline"} size="sm" onClick={() => setGender(gender === g.value ? "" : g.value)} className="flex-1 touch-target">
                {g.label}
              </Button>
            ))}
          </div>
        </div>
        {!isFutureDob && (
          <div className="flex items-center justify-between">
            <Label htmlFor="premature">Born premature?</Label>
            <Switch id="premature" checked={isPremature} onCheckedChange={setIsPremature} />
          </div>
        )}
        {!isFutureDob && isPremature && (
          <div className="space-y-2">
            <Label htmlFor="dueDate">Original Due Date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Used to calculate adjusted age for milestones.</p>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          {isEditMode && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 touch-target"
              onClick={() => setOpen(false)}
              disabled={addChild.isPending || updateChild.isPending || checkingVpc}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1 touch-target"
            disabled={addChild.isPending || updateChild.isPending || checkingVpc}
            onClick={(e) => {
              // Belt-and-suspenders on iOS WKWebView: trigger handleSubmit directly
              // in case the surrounding form's onSubmit doesn't fire reliably.
              e.preventDefault();
              void handleSubmit();
            }}
          >
            {checkingVpc ? "Verifying parental consent…" : (addChild.isPending || updateChild.isPending) ? "Saving..." : isEditMode ? "Save Changes" : "Add Child"}
          </Button>
        </div>
      </form>
      </>
      )}
    </DialogContent>
  );

  const catchUpDialog = catchUpChild && (
    <Dialog
      open={!!catchUpChild}
      onOpenChange={(o) => {
        if (!o) setCatchUpChild(null);
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Catch up on {catchUpChild.name}'s milestones</DialogTitle>
        </DialogHeader>
        <RetroactiveMilestoneCatchUp
          childId={catchUpChild.id}
          childName={catchUpChild.name}
          ageMonths={catchUpChild.ageMonths}
          onDone={() => setCatchUpChild(null)}
        />
      </DialogContent>
    </Dialog>
  );

  if (trigger) {
    return (
      <>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          {content}
        </Dialog>
        {catchUpDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {!isEditMode && (
          <DialogTrigger asChild>
            <Button className="w-full touch-target gap-2">
              <Plus className="w-5 h-5" /> Add Child
            </Button>
          </DialogTrigger>
        )}
        {content}
      </Dialog>
      {catchUpDialog}
    </>
  );
}
