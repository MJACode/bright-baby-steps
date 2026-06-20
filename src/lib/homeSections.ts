import { Sparkles, CalendarHeart, ClipboardList, Moon, TrendingUp, Share2, type LucideIcon } from "lucide-react";

// The home cards each self-gate internally (no activeChild => they render null;
// Sleep Coach is additionally Flare+-gated). This toggle only controls the
// outer wrapper, so hiding a card here won't change that internal behavior.
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
    id: "visitPrep",
    label: "Visit Prep",
    description: "Get ready for upcoming pediatrician visits",
    icon: ClipboardList,
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
  {
    id: "shareWeek",
    label: "Share the Week",
    description: "A weekly recap to send to family",
    icon: Share2,
  },
];
