import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TableName = keyof Database["public"]["Tables"];

export interface ExportTable {
  /** Top-level key in the downloaded JSON. Existing keys must never be renamed. */
  key: string;
  table: TableName;
  /** Human label used in the error toast. */
  label: string;
  select?: string;
  /** Column that must equal the signed-in user's id. RLS already scopes every read. */
  userColumn?: string;
  /** Stable ordering for pagination. Defaults to `id`. */
  orderBy?: string[];
}

/**
 * The single source of truth for "Export My Data" (Privacy § 8, COPPA 16 CFR § 312.6(a)).
 * Every table holding a parent's or child's data belongs here.
 *
 * Deliberately excluded:
 * - Credentials: mcp_access_tokens, mcp_authorization_grants, mcp_clients; the
 *   profiles.vpc_second_token* columns; partner_invitations.invite_code.
 * - Reference/content: allergens, speech, speech_categories, financial_checklist_items,
 *   finance_account_sponsors.
 * - Audit/metering: rights_requests (the request log itself), voice_parse_events
 *   (rate-limit counter with no content).
 */
export const EXPORT_TABLES: readonly ExportTable[] = [
  // Keys below existed before 2026-09-30 — keep them stable for backward compatibility.
  { key: "children", table: "children", label: "children" },
  { key: "sleepLogs", table: "sleep_logs", label: "sleep logs" },
  { key: "feedingLogs", table: "feeding_logs", label: "feeding logs" },
  { key: "diaperLogs", table: "diaper_logs", label: "diaper logs" },
  { key: "milestones", table: "child_speech", label: "milestones" },
  { key: "speechJournal", table: "speech_journal", label: "Word & Sound Journal" },
  { key: "illnessLogs", table: "illness_logs", label: "illness logs" },
  { key: "medicationLogs", table: "medication_logs", label: "medication logs" },
  { key: "chatConversations", table: "chat_conversations", label: "insight conversations", select: "id, title, created_at", userColumn: "user_id" },
  { key: "financeFinder", table: "child_finance_finder", label: "account finder answers", select: "child_id, goal, family_contributes, updated_at", orderBy: ["child_id"] },
  { key: "accountStatus", table: "child_account_status", label: "account status", select: "child_id, account_key, opened_at", orderBy: ["child_id", "account_key"] },

  {
    key: "profile",
    table: "profiles",
    label: "profile",
    select:
      "id, email, full_name, avatar_url, primary_interest, has_partner, notification_prefs, onboarding_completed_at, data_consent_given_at, data_consent_version, coppa_direct_notice_acknowledged_at, coppa_attestation_signed_name, coppa_attestation_signed_at, coppa_attestation_ip, vpc_method, vpc_first_confirmation_at, vpc_second_confirmation_at, vpc_completed_at, inactive_purge_warned_at, created_at, updated_at",
    userColumn: "id",
  },
  { key: "chatMessages", table: "chat_messages", label: "insight messages" },
  { key: "aiMemories", table: "ai_memories", label: "AI memories", userColumn: "user_id" },
  { key: "childMemories", table: "child_memories", label: "child memories" },
  { key: "activityPlans", table: "activity_plans", label: "activity plans" },
  { key: "childActivities", table: "child_activities", label: "activities" },
  { key: "speechPracticePlans", table: "speech_practice_plans", label: "speech practice plans" },
  { key: "childSigns", table: "child_signs", label: "baby signs" },
  { key: "childSignPractice", table: "child_sign_practice", label: "baby sign practice days" },
  { key: "childLeaps", table: "child_leaps", label: "leaps" },
  { key: "customMilestones", table: "custom_milestones", label: "custom milestones" },
  { key: "milestoneFlags", table: "milestone_flags", label: "milestone flags" },
  { key: "allergenIntroductions", table: "allergen_introductions", label: "allergen introductions" },
  { key: "allergenExposureLogs", table: "allergen_exposure_logs", label: "allergen exposures" },
  { key: "allergenReactions", table: "allergen_reactions", label: "allergen reactions" },
  { key: "temperatureLogs", table: "temperature_logs", label: "temperature logs" },
  { key: "weightLogs", table: "weight_logs", label: "growth logs" },
  { key: "supplements", table: "supplements", label: "supplements" },
  { key: "vaccinations", table: "vaccinations", label: "vaccinations" },
  { key: "cryAnalyses", table: "cry_analyses", label: "cry analyses" },
  { key: "sleepPlans", table: "sleep_plans", label: "sleep plans" },
  { key: "sleepDayTodos", table: "sleep_day_todos", label: "sleep day plans" },
  { key: "ferberCheckIns", table: "ferber_check_ins", label: "Ferber check-ins" },
  { key: "pumpingSchedules", table: "pumping_schedules", label: "pumping schedules" },
  { key: "caregiverNotes", table: "caregiver_notes", label: "caregiver notes" },
  { key: "pediatricianVisits", table: "pediatrician_visits", label: "pediatrician visits" },
  { key: "pediatricianReminders", table: "pediatrician_reminders", label: "pediatrician notes" },
  { key: "pediatricianExports", table: "pediatrician_exports", label: "pediatrician reports" },
  { key: "scheduledVisits", table: "scheduled_visits", label: "scheduled visits" },
  { key: "visitPrepDrafts", table: "visit_prep_drafts", label: "visit prep drafts", userColumn: "user_id" },
  { key: "dentalVisits", table: "dental_visits", label: "dental visits" },
  { key: "eiTracker", table: "ei_tracker", label: "early intervention tracker" },
  { key: "eiProviders", table: "ei_providers", label: "early intervention providers" },
  { key: "healthInsurance", table: "health_insurance", label: "health insurance" },
  { key: "lifeInsurance", table: "life_insurance", label: "life insurance" },
  { key: "birthCertificates", table: "birth_certificates", label: "birth certificates" },
  { key: "collegeSavings", table: "college_savings", label: "college savings" },
  { key: "collegeContributions", table: "college_contributions", label: "college contributions" },
  { key: "childChecklistItems", table: "child_checklist_items", label: "checklist progress" },
  { key: "parentFinancialChecklist", table: "parent_financial_checklist", label: "financial checklist progress" },
  { key: "partnerAccess", table: "partner_access", label: "partner access" },
  {
    key: "partnerInvitations",
    table: "partner_invitations",
    label: "partner invitations",
    select: "id, owner_id, invitee_label, role, status, accepted_by, expires_at, created_at, updated_at",
  },
  { key: "notifications", table: "notifications", label: "notifications", userColumn: "user_id" },
  { key: "feedback", table: "feedback", label: "feedback", userColumn: "user_id" },
  { key: "subscriptions", table: "subscriptions", label: "subscription", userColumn: "user_id" },
];

export class ExportReadError extends Error {
  constructor(public readonly failed: { table: string; label: string; message: string }[]) {
    super(`Couldn't read: ${failed.map((f) => f.label).join(", ")}`);
    this.name = "ExportReadError";
  }
}

const PAGE_SIZE = 1000;

type PageResult = { data: unknown[] | null; error: { message: string } | null };
interface PageQuery {
  eq(column: string, value: string): PageQuery;
  order(column: string, options: { ascending: boolean }): PageQuery;
  range(from: number, to: number): PromiseLike<PageResult>;
}
// Passing a union of table names to the typed client trips TS2589; `ExportTable.table`
// is still checked against the generated schema, so a narrow view is safe here.
const untypedClient = supabase as unknown as { from(table: string): { select(columns: string): PageQuery } };

// The PostgREST max-rows cap truncates a plain select without an error, so page
// until an empty page comes back rather than trusting a single response.
async function readAll(entry: ExportTable, userId: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (;;) {
    let query = untypedClient.from(entry.table).select(entry.select ?? "*");
    if (entry.userColumn) query = query.eq(entry.userColumn, userId);
    for (const col of entry.orderBy ?? ["id"]) query = query.order(col, { ascending: true });
    const { data, error } = await query.range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}

export async function collectUserData(user: { id: string; email?: string | null }) {
  const results = await Promise.all(
    EXPORT_TABLES.map(async (entry) => {
      try {
        return { entry, rows: await readAll(entry, user.id) };
      } catch (err) {
        return { entry, error: (err as { message?: string } | null)?.message ?? String(err) };
      }
    }),
  );

  const failed = results.flatMap((r) =>
    "error" in r ? [{ table: r.entry.table, label: r.entry.label, message: r.error }] : [],
  );
  if (failed.length > 0) throw new ExportReadError(failed);

  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, id: user.id },
  };
  for (const r of results) if ("rows" in r) payload[r.entry.key] = r.rows;
  return payload;
}

/** Reads every table, then downloads. Throws (and downloads nothing) if any read fails. */
export async function exportUserData(user: { id: string; email?: string | null }) {
  const payload = await collectUserData(user);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grace-flare-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
