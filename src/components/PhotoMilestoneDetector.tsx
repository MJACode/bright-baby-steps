// Premium feature: parent picks a photo (Capacitor Camera on native, file
// input on web) → upload to milestone-photos → call detect-milestone edge fn
// → show a celebratory result card → save to custom_milestones.
//
// Adapted from the handoff to use this repo's hooks/schema:
//   - useChildren (not useChild); ageMonths computed via getAgeInMonths
//   - custom_milestones uses parent_id (not created_by)
//   - achieved_at is a DATE column, not timestamp — sliced to YYYY-MM-DD

import { useState } from "react";
import { Camera, Loader2, Sparkles, Check, X, RotateCcw, AlertCircle } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type State = "idle" | "uploading" | "detecting" | "result" | "saving" | "saved" | "error";

interface DetectionResult {
  title: string;
  category: "motor" | "language" | "social" | "cognitive" | "feeding";
  confidence: number;
  age_range_months: [number, number];
  caption: string;
  evidence: string;
}

interface Props {
  onClose?: () => void;
}

export function PhotoMilestoneDetector({ onClose }: Props) {
  const { activeChild } = useChildren();
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const childAgeMonths = activeChild
    ? getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)
    : undefined;

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setState("idle");
    setPreviewUrl(null);
    setStoragePath(null);
    setResult(null);
    setError(null);
  };

  const pickPhoto = async () => {
    try {
      let blob: Blob;
      let ext = "jpg";

      if (Capacitor.isNativePlatform()) {
        const photo = await CapCamera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Prompt,
        });
        if (!photo.webPath) throw new Error("No photo");
        const r = await fetch(photo.webPath);
        blob = await r.blob();
        ext = photo.format || "jpg";
      } else {
        const file = await new Promise<File>((resolve, reject) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.capture = "environment";
          input.onchange = () => {
            const f = input.files?.[0];
            if (f) resolve(f);
            else reject(new Error("No file"));
          };
          input.click();
        });
        blob = file;
        ext = file.name.split(".").pop() || "jpg";
      }

      setPreviewUrl(URL.createObjectURL(blob));
      await uploadAndDetect(blob, ext);
    } catch (e) {
      if (e instanceof Error && /cancel|denied/i.test(e.message)) return;
      setError(e instanceof Error ? e.message : "Couldn't open camera");
      setState("error");
    }
  };

  const uploadAndDetect = async (blob: Blob, ext: string) => {
    setState("uploading");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      if (!activeChild) throw new Error("No active child");

      const path = `${userId}/detect-${activeChild.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("milestone-photos")
        .upload(path, blob, { upsert: false, contentType: blob.type });
      if (upErr) throw upErr;
      setStoragePath(path);

      const { data: signed, error: sErr } = await supabase.storage
        .from("milestone-photos")
        .createSignedUrl(path, 600);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("No signed URL");

      setState("detecting");
      const { data, error: fnErr } = await supabase.functions.invoke("detect-milestone", {
        body: {
          signedUrl: signed.signedUrl,
          childAgeMonths,
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.title) throw new Error("Couldn't read the photo");

      setResult(data as DetectionResult);
      setState("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setState("error");
    }
  };

  const saveAsMilestone = async () => {
    if (!result || !storagePath || !activeChild) return;
    setState("saving");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD for date column

      const { error: insErr } = await supabase.from("custom_milestones").insert({
        child_id: activeChild.id,
        parent_id: userId,
        name: result.title,
        category: result.category,
        photo_url: storagePath,
        caption: result.caption,
        confidence: result.confidence,
        source: "photo",
        achieved_at: today,
      });
      if (insErr) throw insErr;
      queryClient.invalidateQueries({ queryKey: ["custom-milestones"] });
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setState("error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-milestones" />
          Photo milestone
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {state === "idle" && (
        <div className="rounded-3xl border border-dashed border-border bg-card p-8 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-milestones/10 flex items-center justify-center">
            <Camera className="w-8 h-8 text-milestones" />
          </div>
          <div>
            <p className="font-semibold">Snap a moment</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Take or pick a photo and we'll suggest the milestone — saved to your timeline.
            </p>
          </div>
          <Button onClick={pickPhoto} className="bg-milestones hover:bg-milestones/90 text-white">
            <Camera className="w-4 h-4 mr-2" />
            Pick a photo
          </Button>
        </div>
      )}

      {(state === "uploading" || state === "detecting" || state === "saving") && (
        <div className="rounded-3xl border border-border bg-card p-6 flex flex-col items-center gap-4">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Selected"
              className="w-full max-h-72 rounded-2xl object-cover"
            />
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {state === "uploading" && "Uploading…"}
            {state === "detecting" && "Looking for the milestone…"}
            {state === "saving" && "Saving to timeline…"}
          </div>
        </div>
      )}

      {state === "result" && result && (
        <ResultCard
          previewUrl={previewUrl}
          result={result}
          onSave={saveAsMilestone}
          onRetry={reset}
        />
      )}

      {state === "saved" && (
        <div className="rounded-3xl border border-milestones/30 bg-milestones-bg p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-milestones/15 flex items-center justify-center">
            <Check className="w-7 h-7 text-milestones" />
          </div>
          <p className="font-semibold">Saved to milestones</p>
          {result && <p className="text-sm text-muted-foreground italic">"{result.caption}"</p>}
          <Button variant="outline" onClick={reset}>
            Capture another
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-3">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-center">{error}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  previewUrl,
  result,
  onSave,
  onRetry,
}: {
  previewUrl: string | null;
  result: DetectionResult;
  onSave: () => void;
  onRetry: () => void;
}) {
  const pct = Math.round(result.confidence * 100);
  const lowConf = result.confidence < 0.55;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl overflow-hidden border border-border bg-card">
        {previewUrl && (
          <img src={previewUrl} alt="Captured moment" className="w-full max-h-80 object-cover" />
        )}
        <div className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-milestones">
            Suggested milestone
          </p>
          <h3 className="font-display text-2xl mt-1">{result.title}</h3>
          <p className="text-sm text-muted-foreground italic mt-2">"{result.caption}"</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>{result.category}</Pill>
            <Pill>
              {result.age_range_months[0]}–{result.age_range_months[1]} mo typical
            </Pill>
            <Pill className={cn(lowConf && "bg-amber-100 text-amber-800")}>
              {pct}% confident
            </Pill>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-semibold">What I saw:</span> {result.evidence}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onRetry}>
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Try another
        </Button>
        <Button
          className="flex-1 bg-milestones hover:bg-milestones/90 text-white"
          onClick={onSave}
        >
          <Check className="w-4 h-4 mr-1.5" />
          Save it
        </Button>
      </div>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-muted text-foreground/80",
        className
      )}
    >
      {children}
    </span>
  );
}
