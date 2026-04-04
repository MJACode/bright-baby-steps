import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Moon, Droplets, UtensilsCrossed, MessageCircle, Baby, Flame, Footprints, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { QuickLogFAB } from "@/components/QuickLogFAB";
import { AddChildDialog } from "@/components/AddChildDialog";
import { TodaysBriefing } from "@/components/TodaysBriefing";
import { AIChatWidget } from "@/components/AIChatWidget";
import { cn } from "@/lib/utils";


export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { children, activeChild, isLoading: childrenLoading } = useChildren();

  // Today's stats
  const { data: todaySleep } = useQuery({
    queryKey: ["today-sleep", activeChild?.id],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("sleep_logs").select("duration_minutes")
        .eq("child_id", activeChild!.id).gte("started_at", `${today}T00:00:00`);
      return data?.reduce((s, l) => s + (l.duration_minutes || 0), 0) ?? 0;
    },
    enabled: !!activeChild,
  });

  const { data: todayFeeds } = useQuery({
    queryKey: ["today-feeds", activeChild?.id],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("feeding_logs").select("id")
        .eq("child_id", activeChild!.id).gte("logged_at", `${today}T00:00:00`);
      return data?.length ?? 0;
    },
    enabled: !!activeChild,
  });

  const { data: todayDiapers } = useQuery({
    queryKey: ["today-diapers", activeChild?.id],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase.from("diaper_logs").select("id")
        .eq("child_id", activeChild!.id).gte("logged_at", `${today}T00:00:00`);
      return data?.length ?? 0;
    },
    enabled: !!activeChild,
  });

  const { data: milestoneStats } = useQuery({
    queryKey: ["milestone-stats", activeChild?.id],
    queryFn: async () => {
      const { data } = await supabase.from("child_speech").select("status")
        .eq("child_id", activeChild!.id);
      const observed = data?.filter(m => m.status === "achieved").length ?? 0;
      return { observed, total: data?.length ?? 0 };
    },
    enabled: !!activeChild,
  });

  // Streak calculation
  const { data: streakDays } = useQuery({
    queryKey: ["streak", activeChild?.id],
    queryFn: async () => {
      const { data } = await supabase.from("sleep_logs").select("started_at")
        .eq("child_id", activeChild!.id).order("started_at", { ascending: false }).limit(100);
      if (!data || data.length === 0) return 0;
      let streak = 0;
      let checkDate = new Date();
      for (let i = 0; i < 60; i++) {
        const dateStr = format(checkDate, "yyyy-MM-dd");
        const hasLog = data.some(l => format(new Date(l.started_at), "yyyy-MM-dd") === dateStr);
        if (hasLog) { streak++; checkDate = new Date(checkDate.getTime() - 86400000); }
        else if (i === 0) { checkDate = new Date(checkDate.getTime() - 86400000); }
        else break;
      }
      return streak;
    },
    enabled: !!activeChild,
  });

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";
  const formatMin = (m: number) => { const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`; };


  const quickActions = [
    { label: "Log Sleep", icon: Moon, path: "/dashboard/sleep", color: "bg-sleep text-white" },
    { label: "Log Feed", icon: UtensilsCrossed, path: "/dashboard/feeding", color: "bg-feeding text-white" },
    { label: "Log Diaper", icon: Droplets, path: "/dashboard/diapers", color: "bg-diapers text-white" },
    { label: "Milestones", icon: MessageCircle, path: "/dashboard/milestones", color: "bg-milestones text-white" },
  ];

  const compactStats = [
    { icon: Moon, value: activeChild ? formatMin(todaySleep ?? 0) : "—", color: "text-sleep", href: "/dashboard/sleep" },
    { icon: UtensilsCrossed, value: activeChild ? String(todayFeeds ?? 0) : "—", color: "text-feeding", href: "/dashboard/feeding" },
    { icon: Droplets, value: activeChild ? String(todayDiapers ?? 0) : "—", color: "text-diapers", href: "/dashboard/diapers" },
    { icon: MessageCircle, value: activeChild ? `${milestoneStats?.observed ?? 0}` : "—", color: "text-milestones", href: "/dashboard/milestones" },
  ];

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="pt-1">
        <h1 className="font-display text-2xl font-bold">
          {firstName ? `Hi, ${firstName}` : "Welcome"} 🌱
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {activeChild ? `${activeChild.name} • ${getAge(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)}` : "Here's your baby's day at a glance."}
        </p>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-4 gap-2">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className={cn(
              "flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl font-semibold text-xs transition-all active:scale-95 touch-target shadow-sm",
              action.color
            )}
          >
            <action.icon className="w-6 h-6" />
            <span className="leading-tight text-center">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Today's Briefing */}
      <TodaysBriefing activeChild={activeChild} todayFeeds={todayFeeds ?? 0} />

      {/* AI Chat */}
      <AIChatWidget />

      {/* Compact Today Summary */}
      <Card className="border-0 bg-secondary">
        <CardContent className="p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Today</p>
          <div className="flex items-center justify-around">
            {compactStats.map((stat) => (
              <Link key={stat.href} to={stat.href} className="flex items-center gap-1.5 active:scale-95 transition-transform">
                <stat.icon className={cn("w-4 h-4", stat.color)} />
                <span className="font-bold text-sm">{stat.value}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Streak */}
      <Card className="border-0 bg-primary/10">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">
                {(streakDays ?? 0) > 0 ? `🔥 ${streakDays}-day tracking streak!` : "Start your tracking streak!"}
              </p>
              <p className="text-xs text-muted-foreground">
                {(streakDays ?? 0) > 0 ? "Keep it going — consistency matters." : "Log your first entry to begin."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Children */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <Baby className="w-5 h-5 text-primary" /> Children
          </h2>
          <AddChildDialog trigger={
            <button className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center touch-target">
              <Plus className="w-4 h-4 text-primary" />
            </button>
          } />
        </div>
        {children.length > 0 ? children.map((child) => (
          <Card key={child.id} className="border-0 bg-secondary">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Footprints className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">{child.name}</p>
                <p className="text-xs text-muted-foreground">
                  {getAge(child.date_of_birth, child.is_premature ?? false, child.due_date)} old
                  {child.is_premature ? " (adjusted)" : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )) : (
          <AddChildDialog trigger={
            <Card className="border border-dashed border-border cursor-pointer hover:bg-secondary/50 transition-colors">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Tap to add your first child 🌱</p>
              </CardContent>
            </Card>
          } />
        )}
      </div>

      <QuickLogFAB />
    </div>
  );
}
