import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Plus, Users, Target, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AddClientDialog } from "@/components/pro/AddClientDialog";
import { useSlpClients, useCaseloadStats, formatClientAge } from "@/hooks/pro/useSlpClients";

export default function ProDashboard() {
  const { data: clients, isLoading } = useSlpClients();
  const { data: stats } = useCaseloadStats();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Caseload</h1>
        <Button className="min-h-[48px] rounded-xl font-bold" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add client
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : !clients || clients.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <p className="font-display text-lg font-bold">Add your first client</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              A first name or initials and an age is all it takes — then you can draft goals,
              session plans, and home programs for them.
            </p>
            <Button className="min-h-[48px] rounded-xl font-bold" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => {
            const s = stats?.[client.id];
            return (
              <Link key={client.id} to={`clients/${client.id}`} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="p-4 flex items-center gap-3 min-h-[48px]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-base truncate">{client.display_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatClientAge(client.age_months)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {s?.activeGoals ?? 0} active {s?.activeGoals === 1 ? "goal" : "goals"}
                        </span>
                        {s?.lastActivity && (
                          <span>
                            Last activity {formatDistanceToNow(parseISO(s.lastActivity), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
