// "More" — secondary navigation surfaced from the bottom tab bar.
// Lists everything that doesn't have a dedicated bar tab: Records,
// Cry insights, Weekly insights, Profile.

import { Link } from "react-router-dom";
import { ChevronRight, FileText, Ear, TrendingUp, User, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePremium } from "@/hooks/usePremium";

interface ToolItem {
  label: string;
  description: string;
  icon: typeof FileText;
  path: string;
  colorClass: string;
  iconClass: string;
  premium?: boolean;
}

const tools: ToolItem[] = [
  {
    label: "Records",
    description: "Medical, insurance, financial, EI",
    icon: FileText,
    path: "/dashboard/records",
    colorClass: "bg-primary/10",
    iconClass: "text-primary",
  },
  {
    label: "Cry insights",
    description: "Hold the phone near baby — get a suggestion in seconds",
    icon: Ear,
    path: "/dashboard/cry-analyzer",
    colorClass: "bg-foreground/10",
    iconClass: "text-foreground",
    premium: true,
  },
  {
    label: "Weekly insights",
    description: "Patterns and trends across sleep, feeding, diapers",
    icon: TrendingUp,
    path: "/dashboard/weekly",
    colorClass: "bg-accent/40",
    iconClass: "text-accent-foreground",
  },
  {
    label: "Profile",
    description: "Children, partners, account",
    icon: User,
    path: "/dashboard/profile",
    colorClass: "bg-muted",
    iconClass: "text-foreground",
  },
];

export default function MorePage() {
  const { isPremium } = usePremium();

  return (
    <div className="space-y-5 pb-24">
      <div>
        <h1 className="font-display text-2xl font-bold">More</h1>
        <p className="text-muted-foreground text-sm mt-1">Everything else that doesn't fit on the tab bar.</p>
      </div>

      <div className="space-y-2">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.path} className="border-0 bg-card">
              <CardContent className="p-0">
                <Link
                  to={tool.path}
                  className="flex items-center gap-3 p-4 active:scale-[0.99] transition-transform touch-target"
                >
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", tool.colorClass)}>
                    <Icon className={cn("w-5 h-5", tool.iconClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-2">
                      {tool.label}
                      {tool.premium && !isPremium && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-foreground text-warning uppercase font-mono">
                          <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                          Plus
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
