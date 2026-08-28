import {
  Sparkles,
  CalendarHeart,
  Moon,
  TrendingUp,
  UtensilsCrossed,
  Droplets,
  Star,
  DollarSign,
  Scale,
  FileText,
  Brain,
  CalendarDays,
  BarChart3,
  Ear,
  Hand,
  type LucideIcon,
} from "lucide-react";

// The home cards each self-gate internally (no activeChild => they render null;
// Sleep Coach is additionally Flare+-gated). This toggle only controls the
// outer wrapper, so hiding a card here won't change that internal behavior.
export interface QuickTile {
  id: string;
  label: string;
  /** Static line shown on tiles without live content (the core four show timers/last-logged instead). */
  hint: string;
  icon: LucideIcon;
  path: string;
  tile: string;
  chip: string;
  labelColor: string;
  dot: string;
}

export const QUICK_TILES: QuickTile[] = [
  { id: "food", label: "Food", hint: "Timers & last feed", icon: UtensilsCrossed, path: "/dashboard/feeding", tile: "bg-feeding-bg", chip: "bg-feeding/15 text-feeding", labelColor: "text-feeding", dot: "bg-feeding" },
  { id: "sleep", label: "Sleep", hint: "Naps & nights", icon: Moon, path: "/dashboard/sleep", tile: "bg-sleep-bg", chip: "bg-sleep/15 text-sleep", labelColor: "text-sleep", dot: "bg-sleep" },
  { id: "diaper", label: "Diaper", hint: "Wet & dirty changes", icon: Droplets, path: "/dashboard/diapers", tile: "bg-diapers-bg", chip: "bg-diapers/15 text-diapers", labelColor: "text-diapers", dot: "bg-diapers" },
  { id: "milestone", label: "Milestone", hint: "Firsts & memories", icon: Star, path: "/dashboard/milestones", tile: "bg-milestones-bg", chip: "bg-milestones/15 text-milestones", labelColor: "text-milestones", dot: "bg-milestones" },
  { id: "signs", label: "Baby Signs", hint: "Sign language program", icon: Hand, path: "/dashboard/signs", tile: "bg-milestones-bg", chip: "bg-milestones/15 text-milestones", labelColor: "text-milestones", dot: "bg-milestones" },
  { id: "financial", label: "Financial", hint: "Checklist & records", icon: DollarSign, path: "/dashboard/records?tab=financial", tile: "bg-finance-bg", chip: "bg-finance/15 text-finance", labelColor: "text-finance", dot: "bg-finance" },
  { id: "growth", label: "Growth", hint: "Weight & height", icon: Scale, path: "/dashboard/growth", tile: "bg-primary/10", chip: "bg-primary/15 text-primary", labelColor: "text-primary", dot: "bg-primary" },
  { id: "records", label: "Records", hint: "Medical, financial, EI", icon: FileText, path: "/dashboard/records", tile: "bg-primary/10", chip: "bg-primary/15 text-primary", labelColor: "text-primary", dot: "bg-primary" },
  { id: "leaps", label: "Leaps", hint: "Your baby's current leap", icon: Brain, path: "/dashboard/leaps", tile: "bg-milestones-bg", chip: "bg-milestones/15 text-milestones", labelColor: "text-milestones", dot: "bg-milestones" },
  { id: "weekly", label: "Weekly insights", hint: "Your week in review", icon: TrendingUp, path: "/dashboard/weekly", tile: "bg-accent/10", chip: "bg-accent/15 text-accent", labelColor: "text-accent", dot: "bg-accent" },
  { id: "calendar", label: "Calendar", hint: "Appointments & events", icon: CalendarDays, path: "/dashboard/calendar", tile: "bg-primary/10", chip: "bg-primary/15 text-primary", labelColor: "text-primary", dot: "bg-primary" },
  { id: "analytics", label: "Analytics", hint: "Charts & trends", icon: BarChart3, path: "/dashboard/analytics", tile: "bg-primary/10", chip: "bg-primary/15 text-primary", labelColor: "text-primary", dot: "bg-primary" },
  { id: "cryInsights", label: "Cry insights", hint: "Decode a cry in seconds", icon: Ear, path: "/dashboard/cry-analyzer", tile: "bg-muted", chip: "bg-foreground/10 text-foreground", labelColor: "text-foreground", dot: "bg-foreground" },
];

export const HOME_SECTIONS: { id: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    id: "briefing",
    label: "Today's Briefing",
    description: "Your AI daily summary",
    icon: Sparkles,
  },
  {
    id: "whatToExpect",
    label: "What to Expect This Week",
    description: "Age-based development to look forward to",
    icon: CalendarHeart,
  },
  {
    id: "sleepCoach",
    label: "Sleep Coach",
    description: "Nap and bedtime windows for today",
    icon: Moon,
  },
  {
    id: "leaps",
    label: "Developmental Leaps",
    description: "Track your baby's current leap",
    icon: TrendingUp,
  },
];
