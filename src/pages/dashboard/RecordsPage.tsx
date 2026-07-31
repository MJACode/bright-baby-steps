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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  // Controlled off the search param so `?tab=` deeplinks land on the right tab
  // even when RecordsPage is already mounted (the quick-log FAB links here from
  // Records itself, which is a same-route navigation).
  const activeTab = VALID_TABS.includes(requestedTab as typeof VALID_TABS[number])
    ? (requestedTab as string)
    : "newbaby";

  const selectTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

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

      <Tabs value={activeTab} onValueChange={selectTab} className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-14 p-1 bg-muted/60">
          <TabsTrigger value="newbaby" className="touch-target gap-1 text-sm font-bold px-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg h-full">
            <Sparkles className="hidden sm:inline w-4 h-4" /> New Baby
          </TabsTrigger>
          <TabsTrigger value="medical" className="touch-target gap-1 text-sm font-bold px-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg h-full">
            <Stethoscope className="hidden sm:inline w-4 h-4" /> Medical
          </TabsTrigger>
          <TabsTrigger value="financial" className="touch-target gap-1 text-sm font-bold px-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg h-full">
            <DollarSign className="hidden sm:inline w-4 h-4" /> Financial
          </TabsTrigger>
          <TabsTrigger value="ei" className="touch-target gap-1 text-sm font-bold px-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg h-full">
            <Activity className="hidden sm:inline w-4 h-4" /> EI
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
