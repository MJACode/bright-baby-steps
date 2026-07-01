import { jsPDF } from "jspdf";
import { format, differenceInMonths, differenceInWeeks, differenceInDays, subDays } from "date-fns";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { supabase } from "@/integrations/supabase/client";

export interface PreVisitChild {
  id: string;
  name: string;
  date_of_birth: string;
  is_premature: boolean | null;
  due_date: string | null;
}

export interface PreVisitInput {
  id: string;
  scheduled_at: string;
  visit_type: string;
  doctor_name: string | null;
  location: string | null;
  notes: string | null;
}

export interface PreVisitReminder {
  id: string;
  text: string;
  include_in_report: boolean;
  entry_type: string;
  category: string | null;
}

const TOPIC_CATEGORY_LABELS: Record<string, string> = {
  behavior: "Behavior",
  feeding: "Feeding",
  sleep: "Sleep",
  health: "Health",
  development: "Development",
  other: "Other",
};

interface RecentActivity {
  feedingCount: number;
  sleepCount: number;
  diaperCount: number;
  latestWeightOz: number | null;
  latestLengthCm: number | null;
  latestMeasuredAt: string | null;
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  well: "Well visit",
  sick: "Sick visit",
  specialist: "Specialist",
  follow_up: "Follow-up",
  other: "Other",
};

function ageAt(dob: string, atDate: Date, isPremature: boolean | null, dueDate: string | null) {
  const birth = new Date(dob);
  if (birth > atDate) return "Not yet born";
  const adjusted = isPremature && dueDate ? new Date(dueDate) : birth;
  const months = differenceInMonths(atDate, adjusted);
  const weeks = differenceInWeeks(atDate, adjusted);
  const days = differenceInDays(atDate, adjusted);
  if (months < 1) return `${weeks}w ${days % 7}d`;
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y ${months % 12}mo`;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "child";
}

async function fetchRecentActivity(childId: string): Promise<RecentActivity> {
  const sevenDaysAgo = subDays(new Date(), 7).toISOString();

  const [feedingRes, sleepRes, diaperRes, weightRes] = await Promise.all([
    supabase
      .from("feeding_logs")
      .select("id", { count: "exact", head: true })
      .eq("child_id", childId)
      .gte("logged_at", sevenDaysAgo),
    supabase
      .from("sleep_logs")
      .select("id", { count: "exact", head: true })
      .eq("child_id", childId)
      .gte("started_at", sevenDaysAgo),
    supabase
      .from("diaper_logs")
      .select("id", { count: "exact", head: true })
      .eq("child_id", childId)
      .gte("logged_at", sevenDaysAgo),
    supabase
      .from("weight_logs")
      .select("weight_oz, length_cm, logged_at")
      .eq("child_id", childId)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    feedingCount: feedingRes.count ?? 0,
    sleepCount: sleepRes.count ?? 0,
    diaperCount: diaperRes.count ?? 0,
    latestWeightOz: weightRes.data?.weight_oz ?? null,
    latestLengthCm: weightRes.data?.length_cm ?? null,
    latestMeasuredAt: weightRes.data?.logged_at ?? null,
  };
}

interface PdfHelpers {
  doc: jsPDF;
  y: number;
  margin: number;
  contentW: number;
  pageW: number;
  checkPage: (needed: number) => void;
  heading: (text: string) => void;
  bodyText: (text: string, indent?: number) => void;
  spacer: (px?: number) => void;
}

function createHelpers(doc: jsPDF): PdfHelpers {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  const h: PdfHelpers = {
    doc, y: 20, margin, contentW, pageW,
    checkPage(needed: number) {
      if (h.y + needed > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        h.y = 20;
      }
    },
    heading(text: string) {
      h.checkPage(18);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(text.toUpperCase(), margin, h.y);
      h.y += 4;
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.5);
      doc.line(margin, h.y, pageW - margin, h.y);
      h.y += 7;
    },
    bodyText(text: string, indent = 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(text, contentW - indent);
      h.checkPage(lines.length * 4 + 2);
      doc.text(lines, margin + indent, h.y);
      h.y += lines.length * 4 + 2;
    },
    spacer(px = 4) { h.y += px; },
  };
  return h;
}

export interface BuildPreVisitPdfArgs {
  visitId: string;
  childId: string;
  parentId: string;
}

async function fetchVisit(visitId: string): Promise<PreVisitInput> {
  const { data, error } = await supabase
    .from("scheduled_visits")
    .select("id, scheduled_at, visit_type, doctor_name, location, notes")
    .eq("id", visitId)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Visit not found.");
  return data;
}

async function fetchChild(childId: string): Promise<PreVisitChild> {
  const { data, error } = await supabase
    .from("children")
    .select("id, name, date_of_birth, is_premature, due_date")
    .eq("id", childId)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Child not found.");
  return {
    id: data.id,
    name: data.name,
    date_of_birth: data.date_of_birth,
    is_premature: data.is_premature ?? null,
    due_date: data.due_date ?? null,
  };
}

async function fetchReminders(childId: string): Promise<PreVisitReminder[]> {
  const { data, error } = await supabase
    .from("pediatrician_reminders")
    .select("id, text, include_in_report, entry_type, category")
    .eq("child_id", childId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function buildPreVisitPdf(args: BuildPreVisitPdfArgs) {
  const [visit, child, reminders] = await Promise.all([
    fetchVisit(args.visitId),
    fetchChild(args.childId),
    fetchReminders(args.childId),
  ]);
  const recent = await fetchRecentActivity(child.id);
  const doc = new jsPDF();
  const h = createHelpers(doc);
  const visitDate = new Date(visit.scheduled_at);
  const visitLabel = VISIT_TYPE_LABELS[visit.visit_type] ?? visit.visit_type;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Grace Flare — Pre-visit Brief", h.margin, h.y);
  h.y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy")}`, h.margin, h.y);
  h.y += 6;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(h.margin, h.y, h.contentW, 14, 2, 2, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  doc.text("Bring this to your appointment. Recent activity is informational only — not a medical record.", h.margin + 3, h.y + 5);
  doc.text("Your provider makes all clinical decisions.", h.margin + 3, h.y + 10);
  h.y += 18;

  h.heading("Visit Details");
  h.bodyText(`Child: ${child.name}`);
  h.bodyText(`Date of birth: ${format(new Date(child.date_of_birth), "MMMM d, yyyy")}`);
  h.bodyText(`Age at visit: ${ageAt(child.date_of_birth, visitDate, child.is_premature, child.due_date)}`);
  h.bodyText(`Visit type: ${visitLabel}`);
  h.bodyText(`Scheduled: ${format(visitDate, "EEEE, MMMM d, yyyy 'at' h:mm a")}`);
  if (visit.doctor_name) h.bodyText(`Provider: ${visit.doctor_name}`);
  if (visit.location) h.bodyText(`Location: ${visit.location}`);
  if (visit.notes) h.bodyText(`Notes: ${visit.notes}`);
  h.spacer();

  const includedQuestions = reminders.filter((r) => r.include_in_report && r.entry_type === "question");
  const includedTopics = reminders.filter((r) => r.include_in_report && r.entry_type === "topic");
  h.heading("Questions for the Doctor");
  if (includedQuestions.length > 0) {
    includedQuestions.forEach((r) => {
      h.bodyText(`• ${r.text}`, 4);
    });
  } else {
    h.bodyText("No questions added yet. You can add them from the Visit Prep card on your dashboard.", 4);
  }
  h.spacer();

  h.heading("Topics & Observations");
  if (includedTopics.length > 0) {
    includedTopics.forEach((r) => {
      const prefix = r.category ? `${TOPIC_CATEGORY_LABELS[r.category] ?? r.category}: ` : "";
      h.bodyText(`• ${prefix}${r.text}`, 4);
    });
  } else {
    h.bodyText("No topics added yet. Add them from the Visit Prep card on your dashboard.", 4);
  }
  h.spacer();

  h.heading("Recent Activity (Last 7 Days)");
  h.bodyText(`Feedings logged: ${recent.feedingCount}`);
  h.bodyText(`Sleep sessions logged: ${recent.sleepCount}`);
  h.bodyText(`Diapers logged: ${recent.diaperCount}`);
  if (recent.latestMeasuredAt) {
    const measuredOn = format(new Date(recent.latestMeasuredAt), "MMM d, yyyy");
    const parts: string[] = [];
    if (recent.latestWeightOz != null) {
      const lb = Math.floor(recent.latestWeightOz / 16);
      const oz = (recent.latestWeightOz % 16).toFixed(1);
      parts.push(`weight ${lb}lb ${oz}oz`);
    }
    if (recent.latestLengthCm != null) parts.push(`length ${recent.latestLengthCm}cm`);
    h.bodyText(`Latest growth measurement (${measuredOn}): ${parts.length ? parts.join(", ") : "no values recorded"}`);
  } else {
    h.bodyText("No growth measurements on file.");
  }
  h.spacer();

  h.checkPage(12);
  doc.setDrawColor(180);
  doc.line(h.margin, h.y, h.pageW - h.margin, h.y);
  h.y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(140, 140, 140);
  doc.text("Generated by Grace Flare — for informational purposes only. Not a substitute for professional medical advice.", h.margin, h.y);

  const filename = `pre-visit-${slugify(child.name)}-${format(visitDate, "yyyy-MM-dd")}.pdf`;

  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output("datauristring").split(",")[1];
    const file = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: `${child.name} pre-visit brief`,
      url: file.uri,
      dialogTitle: "Save or share brief",
    });
  } else {
    doc.save(filename);
  }
}
