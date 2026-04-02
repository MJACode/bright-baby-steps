import { Plus, Moon, UtensilsCrossed, Droplets } from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const quickActions = [
  { label: "Sleep", icon: Moon, path: "/dashboard/sleep", color: "bg-sleep text-white" },
  { label: "Food", icon: UtensilsCrossed, path: "/dashboard/feeding", color: "bg-feeding text-white" },
  { label: "Diaper", icon: Droplets, path: "/dashboard/diapers", color: "bg-diapers text-white", openModal: true },
];

export function QuickLogFAB() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="fixed bottom-[calc(var(--tab-bar-height)+1rem)] right-4 z-50 flex flex-col items-end gap-3">
      {/* Expanded actions */}
      {open && (
        <div className="flex flex-col gap-2 items-end animate-in slide-in-from-bottom-2 fade-in duration-200">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                setOpen(false);
                if (action.openModal) {
                  // Navigate with state to auto-open the modal
                  navigate(action.path, { state: { openModal: true } });
                } else {
                  navigate(action.path);
                }
              }}
              className={cn(
                "flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full shadow-lg touch-target font-semibold text-sm transition-transform active:scale-95",
                action.color
              )}
            >
              {action.label}
              <action.icon className="w-5 h-5" />
            </button>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center transition-all active:scale-95",
          open ? "rotate-45" : "animate-fab-pulse"
        )}
      >
        <Plus className="w-7 h-7" strokeWidth={2.5} />
      </button>
    </div>
  );
}