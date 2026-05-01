import { Link } from "react-router-dom";
import { Brain, TrendingUp, BarChart2, UserCircle, ChevronRight, Banknote } from "lucide-react";

const sections = [
  {
    label: "Milestones",
    description: "Development tracking & word journal",
    icon: Brain,
    path: "/dashboard/milestones",
    colorClass: "bg-milestones/10",
    iconClass: "text-milestones",
  },
  {
    label: "Growth",
    description: "Weight, height & percentile charts",
    icon: TrendingUp,
    path: "/dashboard/growth",
    colorClass: "bg-primary/10",
    iconClass: "text-primary",
  },
  {
    label: "Weekly insights",
    description: "Trends and patterns from the past week",
    icon: BarChart2,
    path: "/dashboard/weekly",
    colorClass: "bg-feeding/10",
    iconClass: "text-feeding",
  },
  {
    label: "Financial",
    description: "Baby expense tracking",
    icon: Banknote,
    path: "/dashboard/milestones?tab=financial",
    colorClass: "bg-sleep/10",
    iconClass: "text-sleep",
  },
  {
    label: "Settings & profile",
    description: "Account, partner, exports & preferences",
    icon: UserCircle,
    path: "/dashboard/profile",
    colorClass: "bg-secondary",
    iconClass: "text-muted-foreground",
  },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <h1 className="font-display text-2xl font-bold">More</h1>
      </div>

      <div className="flex flex-col gap-2">
        {sections.map((section) => (
          <Link
            key={section.path}
            to={section.path}
            className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border active:scale-[0.98] transition-transform"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${section.colorClass}`}>
              <section.icon className={`w-5 h-5 ${section.iconClass}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{section.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
