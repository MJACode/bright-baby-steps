// Records used to be a single page with four tabs (New Baby / Medical /
// Financial / EI). Each of those is now its own top-level surface listed
// directly in More, so nothing is buried a tab-tap deep. This file is the
// shared shell: same header + empty state for all four, with the section
// picked by the route. The tab bodies themselves are unchanged.

import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, getAgeInMonths } from "@/hooks/useChildren";
import { AddChildDialog } from "@/components/AddChildDialog";
import { Activity, DollarSign, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";
import { MedicalTab } from "@/components/records/MedicalTab";
import { EarlyInterventionTab } from "@/components/records/EarlyInterventionTab";
import { NewBabyChecklistTab } from "@/components/records/NewBabyChecklistTab";
import { FinancialTab } from "@/components/records/FinancialTab";

export type RecordSection = "newbaby" | "medical" | "financial" | "ei";

interface SectionMeta {
  title: string;
  icon: LucideIcon;
  iconClass: string;
  /** Shown instead of the child summary line when no child exists yet. */
  emptyHint: string;
}

const RECORD_SECTIONS: Record<RecordSection, SectionMeta> = {
  newbaby: {
    title: "New Baby",
    icon: Sparkles,
    iconClass: "text-primary",
    emptyHint: "Add a child to start the new-baby checklist.",
  },
  medical: {
    title: "Medical",
    icon: Stethoscope,
    iconClass: "text-primary",
    emptyHint: "Add a child to start tracking visits, vaccines, and meds.",
  },
  financial: {
    title: "Financial",
    icon: DollarSign,
    iconClass: "text-finance",
    emptyHint: "Add a child to start the financial checklist.",
  },
  ei: {
    title: "Early Intervention",
    icon: Activity,
    iconClass: "text-primary",
    emptyHint: "Add a child to track Early Intervention providers.",
  },
};

/** Route each section now lives at, keyed by the legacy `?tab=` value. */
const RECORD_SECTION_PATHS: Record<RecordSection, string> = {
  newbaby: "/dashboard/new-baby",
  medical: "/dashboard/medical",
  financial: "/dashboard/financial",
  ei: "/dashboard/early-intervention",
};

export default function RecordsPage({ section }: { section: RecordSection }) {
  const { user } = useAuth();
  const { activeChild } = useChildren();
  const meta = RECORD_SECTIONS[section];
  const Icon = meta.icon;

  const header = (subtitle: string) => (
    <div>
      <h1 className="font-display text-2xl font-bold flex items-center gap-2">
        <Icon className={`w-7 h-7 ${meta.iconClass}`} /> {meta.title}
      </h1>
      <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
    </div>
  );

  if (!activeChild) {
    return (
      <div className="space-y-6">
        {header(meta.emptyHint)}
        <AddChildDialog />
      </div>
    );
  }

  const ageMonths = getAgeInMonths(activeChild.date_of_birth, activeChild.is_premature ?? false, activeChild.due_date);

  return (
    <div className="space-y-5 pb-24">
      {header(`${activeChild.name} • ${ageMonths}mo`)}

      {section === "newbaby" && user && (
        <NewBabyChecklistTab
          childId={activeChild.id}
          parentId={user.id}
          childName={activeChild.name}
          childDob={activeChild.date_of_birth}
        />
      )}

      {section === "medical" && user && (
        <MedicalTab childId={activeChild.id} parentId={user.id} ageMonths={ageMonths} />
      )}

      {section === "financial" && <FinancialTab />}

      {section === "ei" && user && (
        <EarlyInterventionTab
          childId={activeChild.id}
          parentId={user.id}
          childName={activeChild.name}
          childDob={activeChild.date_of_birth}
        />
      )}
    </div>
  );
}

/**
 * Legacy `/dashboard/records?tab=…` entry point. Old deep links (push
 * notifications, Next Step cards saved before the split) still resolve to the
 * right surface; a bare `/dashboard/records` lands on More, where all four
 * sections are now listed.
 */
export function RecordsRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") as RecordSection | null;
  const target = tab && tab in RECORD_SECTION_PATHS ? RECORD_SECTION_PATHS[tab] : "/dashboard/more";
  return <Navigate to={target} replace />;
}
