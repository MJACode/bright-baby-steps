import { Moon, UtensilsCrossed, Droplets, MoreHorizontal, Star } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Sleep", path: "/dashboard/sleep", icon: Moon, colorClass: "text-sleep" },
  { label: "Food", path: "/dashboard/feeding", icon: UtensilsCrossed, colorClass: "text-feeding" },
  { label: "Milestones", path: "/dashboard/milestones", icon: Star, colorClass: "text-primary" },
  { label: "Diapers", path: "/dashboard/diapers", icon: Droplets, colorClass: "text-diapers" },
  { label: "More", path: "/dashboard/more", icon: MoreHorizontal, colorClass: "text-primary" },
];

export function BottomTabBar() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl backdrop-saturate-150 shadow-[0_-1px_0_0_hsl(var(--border))] safe-area-bottom">
      <div className="flex items-stretch justify-around h-[var(--tab-bar-height)] max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <RouterNavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 touch-target transition-colors duration-200",
                isActive ? tab.colorClass : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "transition-colors duration-200",
                isActive && "px-3 py-1 rounded-full bg-current/12"
              )}>
                <tab.icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[11px] font-bold tracking-wide leading-none",
                isActive && "text-foreground"
              )}>
                {tab.label}
              </span>
            </RouterNavLink>
          );
        })}
      </div>
    </nav>
  );
}
