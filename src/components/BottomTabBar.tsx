import { Moon, UtensilsCrossed, Droplets, MoreHorizontal, Home } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Sleep", path: "/dashboard/sleep", icon: Moon, colorClass: "text-sleep" },
  { label: "Food", path: "/dashboard/feeding", icon: UtensilsCrossed, colorClass: "text-feeding" },
  { label: "Home", path: "/dashboard", icon: Home, colorClass: "text-primary", isHome: true },
  { label: "Diapers", path: "/dashboard/diapers", icon: Droplets, colorClass: "text-diapers" },
  { label: "More", path: "/dashboard/more", icon: MoreHorizontal, colorClass: "text-primary" },
];

export function BottomTabBar() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-stretch justify-around h-[var(--tab-bar-height)] max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.isHome
            ? location.pathname === "/dashboard"
            : location.pathname === tab.path;
          return (
            <RouterNavLink
              key={tab.path}
              to={tab.path}
              end={tab.isHome}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 touch-target transition-all duration-200",
                isActive ? tab.colorClass : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-200",
                isActive && "bg-current/10 scale-110",
                tab.isHome && !isActive && "bg-primary/10 rounded-full"
              )}>
                <tab.icon className={cn("w-6 h-6", tab.isHome && !isActive && "text-primary")} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[11px] font-semibold leading-none",
                isActive && "font-bold"
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
