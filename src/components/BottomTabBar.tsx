import { Home, Moon, UtensilsCrossed, Droplets, Star, MoreHorizontal } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Tab {
  label: string;
  path: string;
  icon: typeof Home;
  colorClass: string;
  /** Match only the exact path; without it, sub-routes also light the tab. */
  exact?: boolean;
}

const tabs: Tab[] = [
  { label: "Home", path: "/dashboard", icon: Home, colorClass: "text-primary", exact: true },
  { label: "Sleep", path: "/dashboard/sleep", icon: Moon, colorClass: "text-sleep" },
  { label: "Food", path: "/dashboard/feeding", icon: UtensilsCrossed, colorClass: "text-feeding" },
  { label: "Diapers", path: "/dashboard/diapers", icon: Droplets, colorClass: "text-diapers" },
  { label: "Milestones", path: "/dashboard/milestones", icon: Star, colorClass: "text-milestones" },
  { label: "More", path: "/dashboard/more", icon: MoreHorizontal, colorClass: "text-primary" },
];

export function BottomTabBar() {
  const location = useLocation();

  return (
    <nav className="shrink-0 z-50 bg-card/80 backdrop-blur-xl backdrop-saturate-150 shadow-[0_-1px_0_0_hsl(var(--border))] safe-area-bottom">
      <div className="flex items-stretch justify-around h-[var(--tab-bar-height)] max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? location.pathname === tab.path
            : location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);
          return (
            <RouterNavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 min-w-0 touch-target transition-colors duration-200",
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
                "text-[11px] font-bold tracking-wide leading-none max-w-full truncate px-0.5",
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
