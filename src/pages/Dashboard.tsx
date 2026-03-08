import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon, Droplets, UtensilsCrossed, Brain, DollarSign, Baby } from "lucide-react";
import { Link } from "react-router-dom";

const modules = [
  {
    title: "Sleep Tracking",
    description: "Log and analyze sleep patterns",
    icon: Moon,
    href: "/dashboard/sleep",
    color: "text-blue-500",
  },
  {
    title: "Diaper Tracking",
    description: "Quick logging with health pattern detection",
    icon: Droplets,
    href: "/dashboard/diapers",
    color: "text-amber-500",
  },
  {
    title: "Feeding",
    description: "Track breast, bottle, and solid feeds",
    icon: UtensilsCrossed,
    href: "/dashboard/feeding",
    color: "text-green-500",
  },
  {
    title: "Allergen Introduction",
    description: "Clinically-guided allergen tracking",
    icon: UtensilsCrossed,
    href: "/dashboard/allergens",
    color: "text-red-500",
  },
  {
    title: "Milestones",
    description: "Evidence-based developmental tracking",
    icon: Brain,
    href: "/dashboard/milestones",
    color: "text-purple-500",
  },
  {
    title: "Financial Planning",
    description: "529s, insurance, and checklists",
    icon: DollarSign,
    href: "/dashboard/financial",
    color: "text-emerald-500",
  },
];

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">
          Welcome{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          Your baby tracking dashboard — manage children, view logs, and explore data.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Link key={mod.title} to={mod.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <mod.icon className={`w-5 h-5 ${mod.color}`} />
                </div>
                <div>
                  <CardTitle className="text-base">{mod.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{mod.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Baby className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Children</CardTitle>
          </div>
          <CardDescription>
            Add a child profile to start tracking. All data is secured with row-level security.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No children added yet. This section will display child profiles once auth is configured and a child is added.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
