// "More" — secondary navigation surfaced from the bottom tab bar.
// Lists everything that doesn't have a dedicated bar tab. The record surfaces
// (Medical, Financial, Early Intervention) each get their own line item here
// rather than sitting behind a tab bar inside Records.
//
// "What Grace Flare remembers" is deliberately NOT here — it's a settings
// surface, reached from Profile and from the AI surfaces that use it.

import { Link } from "react-router-dom";
import { Activity, Brain, ChevronRight, DollarSign, Ear, FileText, Scale, Sparkles, Stethoscope, TrendingUp, User } from "lucide-react";
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
    label: "Medical",
    description: "Visits, vaccines, meds, temperature",
    icon: Stethoscope,
    path: "/dashboard/medical",
    colorClass: "bg-primary/10",
    iconClass: "text-primary",
  },
  {
    label: "Financial",
    description: "Insurance, savings, tax credits",
    icon: DollarSign,
    path: "/dashboard/financial",
    colorClass: "bg-finance/10",
    iconClass: "text-finance",
  },
  {
    label: "Early Intervention",
    description: "Referrals, providers, eligibility",
    icon: Activity,
    path: "/dashboard/early-intervention",
    colorClass: "bg-primary/10",
    iconClass: "text-primary",
  },
  {
    label: "Growth",
    description: "Weight and height tracking",
    icon: Scale,
    path: "/dashboard/growth",
    colorClass: "bg-primary/10",
    iconClass: "text-primary",
  },
  {
    label: "Developmental leaps",
    description: "Understand your baby's growth spurts",
    icon: Brain,
    path: "/dashboard/leaps",
    colorClass: "bg-milestones/10",
    iconClass: "text-milestones",
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
        <p className="text-muted-foreground text-sm mt-1">Checklists, growth, insights, and your account.</p>
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
                        <span className="inline-flex items-center gap-1 text-xs font-bold tracking-wider px-1.5 py-0.5 rounded bg-accent text-accent-foreground uppercase">
                          <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                          Flare+
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
