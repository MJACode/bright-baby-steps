import {
  Moon, Baby, Droplets, UtensilsCrossed, Brain, DollarSign, LayoutDashboard, LogOut, TrendingUp, FileText,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const trackingItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Sleep", url: "/dashboard/sleep", icon: Moon },
  { title: "Diapers", url: "/dashboard/diapers", icon: Droplets },
  { title: "Feeding", url: "/dashboard/feeding", icon: UtensilsCrossed },
  { title: "Allergens", url: "/dashboard/allergens", icon: UtensilsCrossed },
  { title: "Milestones", url: "/dashboard/milestones", icon: Brain },
  { title: "Records", url: "/dashboard/records", icon: FileText },
  { title: "Financial", url: "/dashboard/financial", icon: DollarSign },
  { title: "Weekly Insights", url: "/dashboard/weekly", icon: TrendingUp },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Baby className="w-4 h-4" />
              {!collapsed && <span className="font-display font-semibold">Baby Tracker</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {trackingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
