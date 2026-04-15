import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";
import { generatePediatricianReport, ReportData } from "@/services/pdfReportBuilder";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const ALL_SECTIONS = new Set(["speech", "allergens", "feeding", "diapers", "sleep", "illness"] as const);

type SectionKey = "speech" | "allergens" | "feeding" | "diapers" | "sleep" | "illness";

export async function fetchReportData(
  childId: string,
  dateFrom: Date,
  dateTo: Date,
  sections: Set<SectionKey> = ALL_SECTIONS as Set<SectionKey>,
) {
  const from = startOfDay(dateFrom).toISOString();
  const to = endOfDay(dateTo).toISOString();
  const fromDate = format(dateFrom, "yyyy-MM-dd");
  const toDate = format(dateTo, "yyyy-MM-dd");

  const [feedingRes, diaperRes, sleepRes, milestoneRes, allergenRes, categoryRes, lastExportRes, supplementRes, illnessRes, medicationRes] =
    await Promise.all([
      sections.has("feeding")
        ? supabase.from("feeding_logs").select("*").eq("child_id", childId).gte("logged_at", from).lte("logged_at", to).order("logged_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      sections.has("diapers")
        ? supabase.from("diaper_logs").select("*").eq("child_id", childId).gte("logged_at", from).lte("logged_at", to).order("logged_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      sections.has("sleep")
        ? supabase.from("sleep_logs").select("*").eq("child_id", childId).gte("started_at", from).lte("started_at", to).order("started_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      sections.has("speech")
        ? supabase.from("child_speech").select("*, speech:milestone_id(name, category_id)").eq("child_id", childId)
        : Promise.resolve({ data: [] }),
      sections.has("allergens")
        ? supabase.from("allergen_introductions").select("*, allergens(name)").eq("child_id", childId)
        : Promise.resolve({ data: [] }),
      sections.has("speech")
        ? supabase.from("speech_categories").select("*")
        : Promise.resolve({ data: [] }),
      supabase.from("pediatrician_exports").select("created_at").eq("child_id", childId).order("created_at", { ascending: false }).limit(1),
      sections.has("feeding")
        ? supabase.from("supplements").select("*").eq("child_id", childId)
        : Promise.resolve({ data: [] }),
      sections.has("illness")
        ? supabase.from("illness_logs").select("*").eq("child_id", childId).gte("start_date", fromDate).lte("start_date", toDate).order("start_date", { ascending: false })
        : Promise.resolve({ data: [] }),
      sections.has("illness")
        ? supabase.from("medication_logs").select("*").eq("child_id", childId).gte("start_date", fromDate).lte("start_date", toDate).order("start_date", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  return {
    feedings: (feedingRes.data as any[]) ?? [],
    diapers: (diaperRes.data as any[]) ?? [],
    sleeps: (sleepRes.data as any[]) ?? [],
    milestones: (milestoneRes.data as any[]) ?? [],
    allergens: (allergenRes.data as any[]) ?? [],
    categories: (categoryRes.data as any[]) ?? [],
    lastExportDate: (lastExportRes.data as any[])?.[0]?.created_at ?? null,
    supplements: (supplementRes.data as any[]) ?? [],
    illnesses: (illnessRes.data as any[]) ?? [],
    medications: (medicationRes.data as any[]) ?? [],
  };
}

export async function generateAndDownloadReport(
  child: { id: string; name: string; date_of_birth: string; is_premature: boolean | null; due_date: string | null },
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  pediatricianNotes: string = "",
  sections?: Set<SectionKey>,
) {
  const secs = sections ?? (ALL_SECTIONS as Set<SectionKey>);
  const data = await fetchReportData(child.id, dateFrom, dateTo, secs);

  const reportData: ReportData = {
    child,
    dateFrom,
    dateTo,
    ...data,
    pediatricianNotes,
  };

  const doc = generatePediatricianReport(reportData, secs);

  await supabase.from("pediatrician_exports").insert({
    child_id: child.id,
    parent_id: userId,
    export_type: "pdf_report",
    date_range_start: format(dateFrom, "yyyy-MM-dd"),
    date_range_end: format(dateTo, "yyyy-MM-dd"),
  });

  const filename = `${child.name.replace(/\s+/g, "_")}_report_${format(dateFrom, "yyyyMMdd")}-${format(dateTo, "yyyyMMdd")}.pdf`;

  if (Capacitor.isNativePlatform()) {
    // On iOS, programmatic anchor-download doesn't work in WKWebView.
    // Write the PDF to the app's cache directory then open the native share sheet.
    const base64 = doc.output("datauristring").split(",")[1];
    const file = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: `${child.name} Health Report`,
      url: file.uri,
      dialogTitle: "Save or share report",
    });
  } else {
    doc.save(filename);
  }
}
