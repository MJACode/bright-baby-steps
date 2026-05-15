import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChildren } from "@/hooks/useChildren";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkAndRequestVpc, type VpcGateStatus } from "@/lib/vpcGate";
import { VpcGateMessage } from "@/components/VpcGateMessage";
import { CoppaDirectNotice } from "@/components/CoppaDirectNotice";

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

  // Pre-fill form when editing
  useEffect(() => {
    if (child && open) {
      setName(child.name);
      setDob(child.date_of_birth);
      setGender(child.gender ?? "");
      setIsPremature(child.is_premature ?? false);
      setDueDate(child.due_date ?? "");
      setIsExpected(child.is_expected ?? false);
    }
  }, [child, open]);

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
        await addChild.mutateAsync(payload);
        toast({ title: "Child added! 🌱", description: `${name} has been added to your profile.` });
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
            {["boy", "girl", "other"].map((g) => (
              <Button key={g} type="button" variant={gender === g ? "default" : "outline"} size="sm" onClick={() => setGender(gender === g ? "" : g)} className="flex-1 capitalize touch-target">
                {g}
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

  if (trigger) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {content}
      </Dialog>
    );
  }

  return (
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
  );
}
