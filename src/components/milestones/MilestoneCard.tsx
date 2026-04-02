import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, HelpCircle, Clock, AlertTriangle, Camera, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const statusOptions = [
  { value: "achieved", label: "✅ Achieved", icon: Check },
  { value: "emerging", label: "🌱 Emerging", icon: HelpCircle },
  { value: "not_yet", label: "⏳ Not Yet", icon: Clock },
];

interface MilestoneCardProps {
  milestone: any;
  status: string;
  photoUrl?: string | null;
  onStatusChange: (milestoneId: string, status: string) => void;
  onPhotoChange?: (milestoneId: string, photoUrl: string | null) => void;
  isPending: boolean;
  showConcernNote?: boolean;
  userId?: string;
}

export function MilestoneCard({ milestone, status, photoUrl, onStatusChange, onPhotoChange, isPending, showConcernNote, userId }: MilestoneCardProps) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generate signed URL for private bucket
  useEffect(() => {
    if (!photoUrl) { setSignedUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("milestone-photos")
      .createSignedUrl(photoUrl, 3600)
      .then(({ data }) => { if (!cancelled && data) setSignedUrl(data.signedUrl); });
    return () => { cancelled = true; };
  }, [photoUrl]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !onPhotoChange) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image must be under 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const storagePath = `${userId}/${milestone.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("milestone-photos")
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      onPhotoChange(milestone.id, storagePath);
      toast({ title: "📸 Photo saved!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemovePhoto = () => {
    if (onPhotoChange) onPhotoChange(milestone.id, null);
  };

  return (
    <Card className="border-0 bg-card/60">
      <CardHeader className="pb-1 pt-3 px-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm">{milestone.name}</CardTitle>
            <CardDescription className="text-xs">
              Typical: {milestone.age_months_typical_start}–{milestone.age_months_typical_end} months
            </CardDescription>
          </div>
          {photoUrl && (
            <div className="relative shrink-0">
              <img
                src={photoUrl}
                alt={`${milestone.name} photo`}
                className="w-12 h-12 rounded-lg object-cover ring-2 ring-milestones/20"
              />
              <button
                onClick={handleRemovePhoto}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1">
        {milestone.description && (
          <p className="text-xs text-muted-foreground mb-2">{milestone.description}</p>
        )}
        {showConcernNote && status !== "achieved" && (
          <div className="flex items-start gap-2 mb-2 p-2 rounded-lg bg-[hsl(38,92%,95%)] dark:bg-[hsl(38,40%,18%)]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-[hsl(var(--warning))] shrink-0" />
            <p className="text-xs text-[hsl(var(--warning))] dark:text-[hsl(38,80%,65%)]">
              You may want to mention this at your next check-up
            </p>
          </div>
        )}
        <div className="flex gap-1">
          {statusOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={status === opt.value ? "default" : "outline"}
              size="sm"
              className={cn(
                "text-xs touch-target flex-1",
                status === opt.value && opt.value === "achieved" && "bg-success hover:bg-success/90"
              )}
              onClick={() => onStatusChange(milestone.id, opt.value)}
              disabled={isPending}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Photo upload for achieved milestones */}
        {status === "achieved" && onPhotoChange && (
          <div className="mt-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            {!photoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-milestones hover:text-milestones/80 gap-1.5 w-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="w-3.5 h-3.5" />
                {uploading ? "Uploading..." : "Add a photo"}
              </Button>
            )}
            {photoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground gap-1.5 w-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="w-3.5 h-3.5" />
                {uploading ? "Uploading..." : "Change photo"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
