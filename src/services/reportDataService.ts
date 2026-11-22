import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay } from "date-fns";
import { generatePediatricianReport, ReportData, ReportFoodAvoidance, WordJournalEntry } from "@/services/pdfReportBuilder";
import { FOOD_BY_SLUG } from "@/lib/foodCatalog";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const ALL_SECTIONS = new Set(["speech", "words", "allergens", "feeding", "diapers", "sleep", "illness", "temperature"] as const);

type SectionKey = "speech" | "words" | "allergens" | "feeding" | "diapers" | "sleep" | "illness" | "temperature";

/** Distinct words, compared case- and whitespace-insensitively so "Mama" and
 *  "mama " count once. */
function distinctWordCount(rows: { word_or_sound: string }[]): number {
  return new Set(rows.map((r) => r.word_or_sound.trim().toLowerCase())).size;
}

type FoodAvoidanceRow = {
  food_slug: string | null;
  custom_food: string | null;
  reason: string;
  note: string | null;
  created_at: string;
};

/**
 * child_food_avoidances rows -> report entries. Catalog slugs resolve to the
 * catalog name (an unknown slug shows as-is rather than disappearing);
 * custom_food is the parent's own text. Reactions first, then newest first.
 */
export function toReportFoodAvoidances(rows: readonly FoodAvoidanceRow[] | null | undefined): ReportFoodAvoidance[] {
  return (rows ?? [])
    .flatMap((r): ReportFoodAvoidance[] => {
      const food = r.food_slug ? FOOD_BY_SLUG.get(r.food_slug)?.name ?? r.food_slug : r.custom_food?.trim();
      if (!food || (r.reason !== "reaction" && r.reason !== "preference")) return [];
      return [{ food, isCustom: !r.food_slug, reason: r.reason, note: r.note, addedAt: r.created_at }];
    })
    .sort((a, b) =>
      a.reason === b.reason ? b.addedAt.localeCompare(a.addedAt) : a.reason === "reaction" ? -1 : 1,
    );
}

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

  const [feedingRes, diaperRes, sleepRes, milestoneRes, allergenRes, categoryRes, lastExportRes, supplementRes, illnessRes, medicationRes, temperatureRes, wordRes, wordTotalRes, avoidRes] =
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
      sections.has("temperature")
        ? supabase.from("temperature_logs").select("*").eq("child_id", childId).gte("taken_at", from).lte("taken_at", to).order("taken_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      // Word Journal entries inside the reporting window. `word_or_sound` is the
      // legacy column name — the journal tracks words only.
      sections.has("words")
        ? supabase.from("speech_journal").select("*").eq("child_id", childId).gte("entry_date", fromDate).lte("entry_date", toDate).order("entry_date", { ascending: false })
        : Promise.resolve({ data: [] }),
      // All-time vocabulary, so the pediatrician sees the running total and not
      // just what landed in the selected window. Fetches the words themselves
      // rather than a row count: the clinical metric is *distinct* expressive
      // vocabulary, and nothing stops a parent logging "dada" twice (the seed
      // data itself does).
      sections.has("words")
        ? supabase.from("speech_journal").select("word_or_sound").eq("child_id", childId)
        : Promise.resolve({ data: [], error: null }),
      // Solids avoid list, with the allergens section. The current list, not
      // windowed by date: a reaction from before the window still matters.
      // A failed read is flagged (foodAvoidancesError), never shown as an empty
      // list: "no foods left out" would drop recorded reactions from the report.
      sections.has("allergens")
        ? supabase
            .from("child_food_avoidances")
            .select("food_slug, custom_food, reason, note, created_at")
            .eq("child_id", childId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  return {
    feedings: (feedingRes.data as any[]) ?? [],
    diapers: (diaperRes.data as any[]) ?? [],
    sleeps: (sleepRes.data as any[]) ?? [],
    milestones: (milestoneRes.data as any[]) ?? [],
    allergens: (allergenRes.data as any[]) ?? [],
    foodAvoidances: toReportFoodAvoidances(avoidRes.data as FoodAvoidanceRow[] | null),
    foodAvoidancesError: sections.has("allergens") && !!(avoidRes as { error?: unknown }).error,
    categories: (categoryRes.data as any[]) ?? [],
    lastExportDate: (lastExportRes.data as any[])?.[0]?.created_at ?? null,
    supplements: (supplementRes.data as any[]) ?? [],
    illnesses: (illnessRes.data as any[]) ?? [],
    medications: (medicationRes.data as any[]) ?? [],
    temperatures: (temperatureRes.data as any[]) ?? [],
    words: (wordRes.data as WordJournalEntry[] | null) ?? [],
    // null (not 0) when the query failed, so the PDF omits the all-time line
    // rather than printing a self-contradictory "0 all time / 5 this period".
    wordsDistinctAllTime: wordTotalRes.error
      ? null
      : distinctWordCount((wordTotalRes.data as { word_or_sound: string }[] | null) ?? []),
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
