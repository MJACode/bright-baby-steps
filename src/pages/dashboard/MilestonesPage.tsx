import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, PartyPopper, ChevronDown, Plus, Star, Trash2, Camera, X, DollarSign } from "lucide-react";
import { AddChildDialog } from "@/components/AddChildDialog";
import { toast } from "@/hooks/use-toast";
import { WordSoundJournal } from "@/components/WordSoundJournal";
import { MilestoneCategoryGroup } from "@/components/milestones/MilestoneCategoryGroup";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import FinancialContent from "./FinancialPage";

function CustomMilestoneCard({ milestone, onDelete, onRemovePhoto, onAddPhoto }: {
  milestone: any;
  onDelete: () => void;
  onRemovePhoto: () => void;
  onAddPhoto: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!milestone.photo_url) { setSignedUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("milestone-photos")
      .createSignedUrl(milestone.photo_url, 3600)
      .then(({ data }) => { if (!cancelled && data) setSignedUrl(data.signedUrl); });
    return () => { cancelled = true; };
  }, [milestone.photo_url]);

  return (
    <Card className="border-0 bg-milestones-bg/60">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {signedUrl && (
            <div className="relative shrink-0">
              <img src={signedUrl} alt={milestone.name} className="w-12 h-12 rounded-lg object-cover ring-2 ring-milestones/20" />
              <button onClick={onRemovePhoto} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{milestone.name}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(milestone.achieved_at), "MMM d, yyyy")}</p>
          </div>
          <div className="flex items-center gap-1">
            {!milestone.photo_url && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-milestones hover:text-milestones/80" onClick={onAddPhoto}>
                <Camera className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MilestonesPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [showConfetti, setShowConfetti] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDate, setCustomDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [customPhotoFile, setCustomPhotoFile] = useState<File | null>(null);
  const [customPhotoPreview, setCustomPhotoPreview] = useState<string | null>(null);
  const customFileRef = useRef<HTMLInputElement>(null);

  const ageMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : 0;

  const { data: categories, isLoading } = useQuery({
    queryKey: ["milestone-categories-with-milestones"],
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase
        .from("speech_categories").select("*").order("sort_order");
      if (catError) throw catError;
      const { data: milestones, error: msError } = await supabase
        .from("speech").select("*").order("age_months_typical_start, sort_order");
      if (msError) throw msError;
      return cats.map((cat) => ({
        ...cat,
        milestones: milestones.filter((m) => m.category_id === cat.id),
      }));
    },
  });

  const { data: childMilestones } = useQuery({
    queryKey: ["child-milestones", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("child_speech").select("*").eq("child_id", activeChild!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ milestoneId, status }: { milestoneId: string; status: string }) => {
      const existing = childMilestones?.find((cm) => cm.milestone_id === milestoneId);
      if (existing) {
        const { error } = await supabase.from("child_speech").update({
          status,
          achieved_at: status === "achieved" ? new Date().toISOString().split("T")[0] : null,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("child_speech").insert({
          child_id: activeChild!.id,
          parent_id: user!.id,
          milestone_id: milestoneId,
          status,
          achieved_at: status === "achieved" ? new Date().toISOString().split("T")[0] : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["child-milestones"] });
      if (status === "achieved") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
        toast({ title: "🎉 Milestone achieved!" });
      }
    },
  });

  const updateMilestonePhoto = useMutation({
    mutationFn: async ({ milestoneId, photoUrl }: { milestoneId: string; photoUrl: string | null }) => {
      const existing = childMilestones?.find((cm) => cm.milestone_id === milestoneId);
      if (existing) {
        const { error } = await supabase.from("child_speech")
          .update({ photo_url: photoUrl })
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["child-milestones"] });
    },
  });

  // Custom milestones
  const { data: customMilestones } = useQuery({
    queryKey: ["custom-milestones", activeChild?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_milestones")
        .select("*")
        .eq("child_id", activeChild!.id)
        .order("achieved_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeChild,
  });

  const uploadPhoto = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const storagePath = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("milestone-photos").upload(storagePath, file, { upsert: true });
    if (error) throw error;
    return storagePath;
  };

  const addCustomMilestone = useMutation({
    mutationFn: async () => {
      let photoUrl: string | null = null;
      if (customPhotoFile) {
        photoUrl = await uploadPhoto(customPhotoFile);
      }
      const { error } = await supabase.from("custom_milestones").insert({
        child_id: activeChild!.id,
        parent_id: user!.id,
        name: customName.trim(),
        achieved_at: customDate,
        photo_url: photoUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-milestones"] });
      setCustomModalOpen(false);
      setCustomName("");
      setCustomDate(format(new Date(), "yyyy-MM-dd"));
      setCustomPhotoFile(null);
      setCustomPhotoPreview(null);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2000);
      toast({ title: "🎉 Custom milestone saved!" });
    },
  });

  const updateCustomPhoto = useMutation({
    mutationFn: async ({ id, photoUrl }: { id: string; photoUrl: string | null }) => {
      const { error } = await supabase.from("custom_milestones")
        .update({ photo_url: photoUrl })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-milestones"] });
    },
  });

  const deleteCustomMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-milestones"] });
      toast({ title: "Milestone removed" });
    },
  });

  const handleCustomPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be under 5MB", variant: "destructive" });
      return;
    }
    setCustomPhotoFile(file);
    setCustomPhotoPreview(URL.createObjectURL(file));
  };

  const handleCustomPhotoUpload = async (cmId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
        toast({ title: "Invalid image", variant: "destructive" });
        return;
      }
      try {
        const url = await uploadPhoto(file);
        updateCustomPhoto.mutate({ id: cmId, photoUrl: url });
        toast({ title: "📸 Photo saved!" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    };
    input.click();
  };

  // Build status & photo lookup maps
  const milestoneStatuses = useMemo(() => {
    const map: Record<string, string> = {};
    childMilestones?.forEach((cm) => { map[cm.milestone_id] = cm.status; });
    return map;
  }, [childMilestones]);

  const milestonePhotos = useMemo(() => {
    const map: Record<string, string | null> = {};
    childMilestones?.forEach((cm) => { map[cm.milestone_id] = cm.photo_url ?? null; });
    return map;
  }, [childMilestones]);

  const handlePhotoChange = (milestoneId: string, photoUrl: string | null) => {
    updateMilestonePhoto.mutate({ milestoneId, photoUrl });
  };

  // Split milestones into current / upcoming / earlier per category
  const { currentCats, upcomingCats, earlierCats } = useMemo(() => {
    if (!categories) return { currentCats: [], upcomingCats: [], earlierCats: [] };
    const current: any[] = [], upcoming: any[] = [], earlier: any[] = [];
    categories.forEach((cat) => {
      const cur: any[] = [], up: any[] = [], ear: any[] = [];
      cat.milestones.forEach((m: any) => {
        if (ageMonths >= m.age_months_typical_start && ageMonths <= m.age_months_typical_end) cur.push(m);
        else if (ageMonths < m.age_months_typical_start) up.push(m);
        else ear.push(m);
      });
      current.push({ ...cat, milestones: cur });
      upcoming.push({ ...cat, milestones: up });
      earlier.push({ ...cat, milestones: ear });
    });
    return { currentCats: current, upcomingCats: upcoming, earlierCats: earlier };
  }, [categories, ageMonths]);

  const handleStatusChange = (milestoneId: string, status: string) => {
    updateMilestone.mutate({ milestoneId, status });
  };

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7 text-milestones" /> Milestones
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to track milestones.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const totalMilestones = categories?.reduce((s, c) => s + c.milestones.length, 0) ?? 0;
  const achievedCount = childMilestones?.filter((cm) => cm.status === "achieved").length ?? 0;
  const progressPct = totalMilestones > 0 ? Math.round((achievedCount / totalMilestones) * 100) : 0;

  const hasCurrentMilestones = currentCats.some((c) => c.milestones.length > 0);
  const hasUpcomingMilestones = upcomingCats.some((c) => c.milestones.length > 0);
  const hasEarlierMilestones = earlierCats.some((c) => c.milestones.length > 0);

  const categoryGroupProps = {
    milestoneStatuses,
    milestonePhotos,
    onStatusChange: handleStatusChange,
    onPhotoChange: handlePhotoChange,
    isPending: updateMilestone.isPending,
    ageMonths,
    userId: user?.id,
  };

  return (
    <div className="space-y-5">
      {showConfetti && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
          <PartyPopper className="w-24 h-24 text-milestones animate-bounce" />
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Brain className="w-7 h-7 text-milestones" /> Milestones
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name} • {ageMonths}mo {activeChild.is_premature ? "(adjusted)" : ""}
        </p>
        <p className="text-xs text-muted-foreground mt-1 italic">
          ⚠️ Every child develops at their own pace. Consult your pediatrician with concerns.
        </p>
      </div>

      {/* Progress ring */}
      <Card className="border-0 bg-milestones-bg">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--milestones) / 0.2)" strokeWidth="3" />
                <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--milestones))" strokeWidth="3" strokeDasharray={`${progressPct}, 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-milestones">{progressPct}%</span>
            </div>
            <div>
              <p className="font-bold text-sm">{achievedCount} of {totalMilestones} observed</p>
              <p className="text-xs text-muted-foreground">
                {progressPct >= 80 ? "🌟 On Track" : progressPct >= 50 ? "Almost There" : "Let's Check In"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading milestones...</p>
      ) : (
        <div className="space-y-6">
          {hasCurrentMilestones && (
            <div className="space-y-2">
              <h2 className="font-display font-bold text-lg text-foreground">
                Right now ({ageMonths}mo)
              </h2>
              <MilestoneCategoryGroup categories={currentCats} {...categoryGroupProps} />
            </div>
          )}

          {hasUpcomingMilestones && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
                <h2 className="font-display font-bold text-lg text-muted-foreground">Coming up next</h2>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <MilestoneCategoryGroup categories={upcomingCats} {...categoryGroupProps} />
              </CollapsibleContent>
            </Collapsible>
          )}

          {hasEarlierMilestones && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full group touch-target">
                <h2 className="font-display font-bold text-lg text-muted-foreground">Earlier milestones</h2>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <MilestoneCategoryGroup categories={earlierCats} {...categoryGroupProps} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {/* Custom Milestones */}
      {activeChild && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-milestones" /> Custom Milestones
            </h2>
          </div>

          {customMilestones && customMilestones.length > 0 && (
            <div className="space-y-2">
              {customMilestones.map((cm) => (
                <CustomMilestoneCard
                  key={cm.id}
                  milestone={cm}
                  onDelete={() => deleteCustomMilestone.mutate(cm.id)}
                  onRemovePhoto={() => updateCustomPhoto.mutate({ id: cm.id, photoUrl: null })}
                  onAddPhoto={() => handleCustomPhotoUpload(cm.id)}
                />
              ))}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full border-dashed border-milestones/30 text-milestones hover:bg-milestones-bg gap-2 touch-target"
            onClick={() => {
              setCustomName("");
              setCustomDate(format(new Date(), "yyyy-MM-dd"));
              setCustomPhotoFile(null);
              setCustomPhotoPreview(null);
              setCustomModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" /> Custom Milestone
          </Button>
        </div>
      )}

      {/* Custom Milestone Modal */}
      <Dialog open={customModalOpen} onOpenChange={setCustomModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add Custom Milestone</DialogTitle>
            <DialogDescription>Record a special moment — first laugh, first step, anything meaningful!</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">What happened?</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. First laugh, first solid bite, rolled over"
                maxLength={100}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Date</Label>
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
              />
            </div>

            {/* Photo upload */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Photo (optional)</Label>
              <input
                ref={customFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCustomPhotoSelect}
              />
              {customPhotoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={customPhotoPreview}
                    alt="Preview"
                    className="w-20 h-20 rounded-lg object-cover ring-2 ring-milestones/20"
                  />
                  <button
                    onClick={() => {
                      setCustomPhotoFile(null);
                      setCustomPhotoPreview(null);
                      if (customFileRef.current) customFileRef.current.value = "";
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-milestones border-milestones/30"
                  onClick={() => customFileRef.current?.click()}
                >
                  <Camera className="w-3.5 h-3.5" /> Add photo
                </Button>
              )}
            </div>

            <Button
              onClick={() => {
                if (!customName.trim()) {
                  toast({ title: "Please enter a milestone name", variant: "destructive" });
                  return;
                }
                addCustomMilestone.mutate();
              }}
              disabled={addCustomMilestone.isPending}
              className="w-full h-12 text-base font-bold rounded-xl touch-target bg-milestones hover:bg-milestones/90 text-white"
            >
              {addCustomMilestone.isPending ? "Saving..." : "Save Milestone 🎉"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {activeChild && <WordSoundJournal childId={activeChild.id} />}
    </div>
  );
}
