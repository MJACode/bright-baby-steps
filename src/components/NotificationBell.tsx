import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Notification {
  id: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  child_id: string | null;
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as Notification[]) || [];
    },
    enabled: !!user,
    refetchInterval: 30_000, // poll every 30s
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await supabase
        .from("notifications")
        .update({ read: true })
        .in("id", unreadIds);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0) {
      markAllRead.mutate();
    }
  };

  const typeIcon: Record<string, string> = {
    diaper_reminder: "🧷",
    sleep_reminder: "🌙",
    milestone_age: "🎂",
    appointment_reminder: "📋",
    pumping_reminder: "🧴",
    reactivation: "👋",
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative touch-target text-muted-foreground">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70vh] p-0 rounded-t-2xl">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="text-sm">Notifications</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No notifications yet ✨
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "p-4 text-sm transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <p className="leading-snug">
                    {typeIcon[n.type] || "🔔"} {n.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
