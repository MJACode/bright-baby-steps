import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, MessageSquareHeart, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function FeedbackDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Screenshot must be under 5 MB.");
      return;
    }
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!message.trim() || !user) return;
    setSending(true);

    let screenshotUrl: string | null = null;

    if (screenshot) {
      const ext = screenshot.name.split(".").pop() ?? "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("feedback-screenshots")
        .upload(path, screenshot, { contentType: screenshot.type, upsert: false });

      if (uploadError) {
        toast.error("Failed to upload screenshot. Sending feedback without it.");
      } else {
        const { data } = supabase.storage.from("feedback-screenshots").getPublicUrl(path);
        screenshotUrl = data.publicUrl;
      }
    }

    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      message: message.trim(),
      ...(screenshotUrl ? { screenshot_url: screenshotUrl } : {}),
    });

    setSending(false);

    if (error) {
      toast.error("Failed to send feedback");
      return;
    }

    toast.success("Thank you for your feedback! 💛");
    setMessage("");
    removeScreenshot();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <MessageSquareHeart className="w-4 h-4" /> Share Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share Your Feedback</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tell us what you love, what's confusing, or what you'd like to see next.
        </p>
        <Textarea
          placeholder="Your feedback..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={4}
        />

        {/* Screenshot attachment */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {previewUrl ? (
          <div className="relative rounded-lg overflow-hidden border border-border">
            <img src={previewUrl} alt="Screenshot preview" className="w-full max-h-40 object-cover" />
            <button
              type="button"
              onClick={removeScreenshot}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
              aria-label="Remove screenshot"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <ImagePlus className="w-4 h-4" />
            Attach a screenshot (optional)
          </button>
        )}

        <Button onClick={handleSubmit} disabled={!message.trim() || sending} className="w-full">
          {sending ? "Sending..." : "Send Feedback"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
