import { useAuth } from "@/hooks/useAuth";
import { useChildren } from "@/hooks/useChildren";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { User, LogOut, Baby, ClipboardList, ChevronDown } from "lucide-react";
import PediatricianExport from "@/components/PediatricianExport";
import ExportHistory from "@/components/ExportHistory";
import PartnerManagement from "@/components/PartnerManagement";
import { FeedbackDialog } from "@/components/FeedbackDialog";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { children } = useChildren();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <User className="w-7 h-7 text-primary" /> Profile & Settings
        </h1>
      </div>

      {/* Account info */}
      <Card className="border-0 bg-muted/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold">{user?.email}</p>
          {children.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Baby className="w-4 h-4" />
              {children.map((c) => c.name).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pediatrician Report — collapsible */}
      <Collapsible>
        <Card className="border-0 bg-muted/50">
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Custom Report
              </CardTitle>
              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <p className="text-xs text-muted-foreground">
                Need a custom date range or specific sections? Configure below.
              </p>
              <PediatricianExport />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Export History */}
      <ExportHistory />

      {/* Partner Management */}
      <PartnerManagement />

      {/* Sign out */}
      <Button variant="outline" onClick={signOut} className="w-full gap-2">
        <LogOut className="w-4 h-4" /> Sign Out
      </Button>
    </div>
  );
}
