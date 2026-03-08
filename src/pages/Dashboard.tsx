import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon, Droplets, UtensilsCrossed, Brain, DollarSign, Baby, Flame, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import { QuickLogFAB } from "@/components/QuickLogFAB";
import { cn } from "@/lib/utils";

const summaryCards = [
  {
    title: "Sleep",
    icon: Moon,
    href: "/dashboard/sleep",
    color: "text-sleep",
    bgColor: "bg-sleep-bg",
    stat: "No data yet",
    sub: "Start logging sleep",
  },
  {
    title: "Feeding",
    icon: UtensilsCrossed,
    href: "/dashboard/feeding",
    color: "text-feeding",
    bgColor: "bg-feeding-bg",
    stat: "No data yet",
    sub: "Log a feed",
  },
  {
    title: "Diapers",
    icon: Droplets,
    href: "/dashboard/diapers",
    color: "text-diapers",
    bgColor: "bg-diapers-bg",
    stat: "No data yet",
    sub: "Quick-log diaper",
  },
  {
    title: "Milestones",
    icon: Brain,
    href: "/dashboard/milestones",
    color: "text-milestones",
    bgColor: "bg-milestones-bg",
    stat: "53 to track",
    sub: "View milestones",
  },
];

export default function Dashboard() {
  const { user } = useAuth();

  const { data: children } = useQuery({
    queryKey: ["children"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("children")
        .select("*")
        .is("archived_at", null)
        .order("date_of_birth", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="pt-1">
        <h1 className="font-display text-2xl font-bold">
          {firstName ? `Hi, ${firstName}` : "Welcome"} 🌱
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Here's your baby's day at a glance.
        </p>
      </div>

      {/* Streak / highlight banner */}
      <Card className="border-0 bg-primary/10">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm">Start your tracking streak!</p>
            <p className="text-xs text-muted-foreground">Add a child profile and log your first entry.</p>
          </div>
        </CardContent>
      </Card>

      {/* Summary grid — large touch targets */}
      <div className="grid grid-cols-2 gap-3">
        {summaryCards.map((card) => (
          <Link key={card.title} to={card.href}>
            <Card className={cn(
              "border-0 transition-all active:scale-[0.97] touch-target h-full",
              card.bgColor
            )}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <card.icon className={cn("w-6 h-6", card.color)} />
                  <span className={cn("text-xs font-bold uppercase tracking-wide", card.color)}>
                    {card.title}
                  </span>
                </div>
                <p className="font-bold text-lg leading-tight">{card.stat}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Children section */}
      <div className="space-y-3">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Baby className="w-5 h-5 text-primary" /> Children
        </h2>
        {children && children.length > 0 ? (
          <div className="space-y-2">
            {children.map((child) => (
              <Card key={child.id} className="border-0 bg-secondary">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Sprout className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Born {new Date(child.date_of_birth).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border border-dashed border-border">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No children added yet. Add a child profile to start tracking.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity feed placeholder */}
      <div className="space-y-3">
        <h2 className="font-display font-bold text-lg">Recent Activity</h2>
        <Card className="border-0 bg-secondary">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your chronological activity feed will appear here once you start logging.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick log FAB */}
      <QuickLogFAB />
    </div>
  );
}