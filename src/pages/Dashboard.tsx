import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAge } from "@/hooks/useChildren";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Moon, Droplets, UtensilsCrossed, MessageCircle, DollarSign, Baby, Flame, Sprout, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { QuickLogFAB } from "@/components/QuickLogFAB";
import { AddChildDialog } from "@/components/AddChildDialog";
import { cn } from "@/lib/utils";
import { format, isToday, differenceInDays } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
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

  // Activity feed
  const { data: recentActivity } = useQuery({
    queryKey: ["activity-feed", activeChild?.id],
    queryFn: async () => {
      const [sleepRes, feedRes, diaperRes] = await Promise.all([
        supabase.from("sleep_logs").select("id, started_at, duration_minutes, sleep_type").eq("child_id", activeChild!.id).order("started_at", { ascending: false }).limit(5),
        supabase.from("feeding_logs").select("id, logged_at, feeding_type, amount_oz").eq("child_id", activeChild!.id).order("logged_at", { ascending: false }).limit(5),
        supabase.from("diaper_logs").select("id, logged_at, diaper_type").eq("child_id", activeChild!.id).order("logged_at", { ascending: false }).limit(5),
      ]);
      const items = [
        ...(sleepRes.data?.map(s => ({ type: "sleep" as const, time: s.started_at, desc: `${s.sleep_type === "nap" ? "☀️ Nap" : "🌙 Night"} — ${s.duration_minutes || 0}min`, icon: Moon, color: "text-sleep" })) ?? []),
        ...(feedRes.data?.map(f => ({ type: "feed" as const, time: f.logged_at, desc: `${f.feeding_type === "breast" ? "🤱" : f.feeding_type === "bottle" ? "🍼" : f.feeding_type === "pump" ? "🧴" : "🥣"} ${f.feeding_type}${f.amount_oz ? ` — ${f.amount_oz}oz` : ""}`, icon: UtensilsCrossed, color: "text-feeding" })) ?? []),
        ...(diaperRes.data?.map(d => ({ type: "diaper" as const, time: d.logged_at, desc: `${d.diaper_type === "wet" ? "💧" : d.diaper_type === "dirty" ? "💩" : d.diaper_type === "both" ? "💧💩" : "✨"} ${d.diaper_type} diaper`, icon: Droplets, color: "text-diapers" })) ?? []),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);
      return items;
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

  const summaryCards = [
    { title: "Sleep", icon: Moon, href: "/dashboard/sleep", color: "text-sleep", bgColor: "bg-sleep-bg", stat: activeChild ? formatMin(todaySleep ?? 0) : "—", sub: activeChild ? "today" : "Add child" },
    { title: "Feeding", icon: UtensilsCrossed, href: "/dashboard/feeding", color: "text-feeding", bgColor: "bg-feeding-bg", stat: activeChild ? String(todayFeeds ?? 0) : "—", sub: activeChild ? "feeds today" : "Add child" },
    { title: "Diapers", icon: Droplets, href: "/dashboard/diapers", color: "text-diapers", bgColor: "bg-diapers-bg", stat: activeChild ? String(todayDiapers ?? 0) : "—", sub: activeChild ? "changes today" : "Add child" },
    { title: "Speech", icon: MessageCircle, href: "/dashboard/milestones", color: "text-milestones", bgColor: "bg-milestones-bg", stat: activeChild ? `${milestoneStats?.observed ?? 0}` : "—", sub: activeChild ? "observed" : "Add child" },
  ];

  return (
    <div className="space-y-5">
      <div className="pt-1">
        <h1 className="font-display text-2xl font-bold">
          {firstName ? `Hi, ${firstName}` : "Welcome"} 🌱
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {activeChild ? `${activeChild.name} • ${getAge(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date)}` : "Here's your baby's day at a glance."}
        </p>
      </div>

      {/* Streak */}
      <Card className="border-0 bg-primary/10">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
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
        </CardContent>
      </Card>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3">
        {summaryCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className={cn("border-0 transition-all active:scale-[0.97] touch-target h-full", card.bgColor)}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <card.icon className={cn("w-6 h-6", card.color)} />
                  <span className={cn("text-xs font-bold uppercase tracking-wide", card.color)}>{card.title}</span>
                </div>
                <p className="font-bold text-2xl leading-tight">{card.stat}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

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
                <Sprout className="w-5 h-5 text-primary" />
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

      {/* Activity feed */}
      <div className="space-y-2">
        <h2 className="font-display font-bold text-lg">Recent Activity</h2>
        {recentActivity && recentActivity.length > 0 ? recentActivity.map((item, i) => (
          <Card key={`${item.type}-${i}`} className="border-0 bg-secondary">
            <CardContent className="p-3 flex items-center gap-3">
              <item.icon className={cn("w-5 h-5 shrink-0", item.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.desc}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(item.time), "MMM d, h:mm a")}</p>
              </div>
            </CardContent>
          </Card>
        )) : (
          <Card className="border-0 bg-secondary">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Your activity feed will appear here once you start logging.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <QuickLogFAB />
    </div>
  );
}
