import { generatePediatricianReport, type ReportData } from "@/services/pdfReportBuilder";

// ── jsPDF mock ────────────────────────────────────────────────────────────────
// We don't want to run actual PDF rendering in tests — just verify the builder
// calls the right methods and doesn't throw for various data shapes.

const mockDoc = {
  internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  setFontSize: vi.fn(),
  setFont: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  line: vi.fn(),
  setFillColor: vi.fn(),
  roundedRect: vi.fn(),
  // splitTextToSize must return an array so bodyText can iterate over lines
  splitTextToSize: vi.fn((t: string) => [t]),
  addPage: vi.fn(),
  save: vi.fn(),
};

vi.mock("jspdf", () => ({ jsPDF: vi.fn(() => mockDoc) }));
vi.mock("@/hooks/useChildren", () => ({ getAge: vi.fn(() => "6mo") }));

// ── helpers ───────────────────────────────────────────────────────────────────

const baseChild = {
  name: "Test Baby",
  date_of_birth: "2024-01-15",
  is_premature: false,
  due_date: null,
};

const baseData: ReportData = {
  child: baseChild,
  dateFrom: new Date("2024-06-01"),
  dateTo: new Date("2024-06-30"),
  milestones: [],
  categories: [],
  lastExportDate: null,
  feedings: [],
  supplements: [],
  diapers: [],
  sleeps: [],
  allergens: [],
  illnesses: [],
  medications: [],
  temperatures: [],
  pediatricianNotes: "",
};

beforeEach(() => vi.clearAllMocks());

// ── generatePediatricianReport ────────────────────────────────────────────────

describe("generatePediatricianReport", () => {
  it("returns a jsPDF document without throwing", () => {
    const doc = generatePediatricianReport(baseData, new Set(["speech", "feeding", "diapers", "sleep", "illness", "allergens"]));
    expect(doc).toBe(mockDoc);
  });

  it("always renders the title and child info regardless of sections", () => {
    generatePediatricianReport(baseData, new Set());
    // doc.text() is called with either a string (direct calls) or string[] (via bodyText→splitTextToSize)
    const flatten = (v: unknown): string => Array.isArray(v) ? v.join(" ") : String(v);
    const textCalls = mockDoc.text.mock.calls.map((c) => flatten(c[0]));
    expect(textCalls.some((t) => t.includes("Grace Flare"))).toBe(true);
    expect(textCalls.some((t) => t.includes("Test Baby"))).toBe(true);
  });

  it("skips optional sections when not in the sections set", () => {
    generatePediatricianReport({ ...baseData, feedings: [{ feeding_type: "bottle", amount_oz: 4 }] }, new Set());
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    // "FEEDING" heading should NOT appear
    expect(textCalls.some((t) => typeof t === "string" && t === "FEEDING")).toBe(false);
  });

  it("renders the feeding section when 'feeding' is in sections and data exists", () => {
    const feedings = Array.from({ length: 3 }, (_, i) => ({
      feeding_type: "bottle",
      amount_oz: 4 + i,
      duration_minutes: null,
    }));
    generatePediatricianReport({ ...baseData, feedings }, new Set(["feeding"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "FEEDING")).toBe(true);
  });

  it("renders the milestones section when 'speech' is in sections", () => {
    generatePediatricianReport(baseData, new Set(["speech"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "MILESTONES")).toBe(true);
  });

  it("renders the diapers section when 'diapers' is in sections and data exists", () => {
    const diapers = [
      { diaper_type: "wet", logged_at: "2024-06-10T10:00:00Z", color: null, consistency: null, notes: null },
      { diaper_type: "dirty", logged_at: "2024-06-10T14:00:00Z", color: "yellow", consistency: "soft", notes: null },
    ];
    generatePediatricianReport({ ...baseData, diapers }, new Set(["diapers"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "DIAPERS")).toBe(true);
  });

  it("flags clinically significant diaper colors", () => {
    const diapers = [
      { diaper_type: "dirty", logged_at: "2024-06-10T14:00:00Z", color: "white", consistency: "loose", notes: null },
    ];
    generatePediatricianReport({ ...baseData, diapers }, new Set(["diapers"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => String(c[0]));
    expect(textCalls.some((t) => t.includes("Clinically Significant"))).toBe(true);
  });

  it("renders the sleep section when 'sleep' is in sections and data exists", () => {
    const sleeps = [
      { sleep_type: "night", started_at: "2024-06-10T20:00:00Z", ended_at: "2024-06-11T06:00:00Z", duration_minutes: null, quality: "good" },
    ];
    generatePediatricianReport({ ...baseData, sleeps }, new Set(["sleep"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "SLEEP")).toBe(true);
  });

  it("renders the illness section when 'illness' is in sections and data exists", () => {
    const illnesses = [{ id: "1", illness_name: "Cold", start_date: "2024-06-05", end_date: "2024-06-08", notes: null }];
    generatePediatricianReport({ ...baseData, illnesses }, new Set(["illness"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "ILLNESS & MEDICATIONS")).toBe(true);
  });

  it("renders the allergens section when 'allergens' is in sections and data exists", () => {
    const allergens = [
      { status: "completed", notes: null, allergens: { name: "Peanuts" } },
      { status: "reaction_observed", notes: "Hives", allergens: { name: "Eggs" } },
    ];
    generatePediatricianReport({ ...baseData, allergens }, new Set(["allergens"]));
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "ALLERGEN INTRODUCTIONS")).toBe(true);
  });

  it("renders parent notes when provided", () => {
    generatePediatricianReport({ ...baseData, pediatricianNotes: "Please discuss sleep regression." }, new Set());
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "PARENT NOTES & REMINDERS")).toBe(true);
  });

  it("skips parent notes section when notes are empty", () => {
    generatePediatricianReport({ ...baseData, pediatricianNotes: "   " }, new Set());
    const textCalls = mockDoc.text.mock.calls.map((c) => c[0]);
    expect(textCalls.some((t) => typeof t === "string" && t === "PARENT NOTES & REMINDERS")).toBe(false);
  });

  it("includes the premature flag in child info when applicable", () => {
    const data = { ...baseData, child: { ...baseChild, is_premature: true, due_date: "2024-03-20" } };
    generatePediatricianReport(data, new Set());
    const textCalls = mockDoc.text.mock.calls.map((c) => String(c[0]));
    expect(textCalls.some((t) => t.includes("Premature"))).toBe(true);
  });
});
