import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { AddChildDialog } from "@/components/AddChildDialog";
import { FileText, Stethoscope, Activity, DollarSign, Sparkles } from "lucide-react";
import { MedicalTab } from "@/components/records/MedicalTab";
import { EarlyInterventionTab } from "@/components/records/EarlyInterventionTab";
import { NewBabyChecklistTab } from "@/components/records/NewBabyChecklistTab";
import { FinancialTab } from "@/components/records/FinancialTab";

const VALID_TABS = ["newbaby", "medical", "financial", "ei"] as const;

export default function RecordsPage() {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const defaultTab = VALID_TABS.includes(requestedTab as typeof VALID_TABS[number])
    ? (requestedTab as string)
    : "newbaby";

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary" /> Records
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Add a child to start tracking records.</p>
        </div>
        <AddChildDialog />
      </div>
    );
  }

  const ageMonths = getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <FileText className="w-7 h-7 text-primary" /> Records
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeChild.name} • {ageMonths}mo
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="newbaby" className="gap-1 text-[10px] px-1">
            <Sparkles className="w-3.5 h-3.5" /> New Baby
          </TabsTrigger>
          <TabsTrigger value="medical" className="gap-1 text-[10px] px-1">
            <Stethoscope className="w-3.5 h-3.5" /> Medical
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1 text-[10px] px-1">
            <DollarSign className="w-3.5 h-3.5" /> Financial
          </TabsTrigger>
          <TabsTrigger value="ei" className="gap-1 text-[10px] px-1">
            <Activity className="w-3.5 h-3.5" /> EI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="newbaby" className="mt-4">
          {user && (
            <NewBabyChecklistTab
              childId={activeChild.id}
              parentId={user.id}
              childName={activeChild.name}
              childDob={activeChild.date_of_birth}
            />
          )}
        </TabsContent>

        <TabsContent value="medical" className="mt-4">
          {user && <MedicalTab childId={activeChild.id} parentId={user.id} ageMonths={ageMonths} />}
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <FinancialTab />
        </TabsContent>

        <TabsContent value="ei" className="mt-4">
          {user && (
            <EarlyInterventionTab
              childId={activeChild.id}
              parentId={user.id}
              childName={activeChild.name}
              childDob={activeChild.date_of_birth}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
