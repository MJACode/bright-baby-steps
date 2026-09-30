import { EXPORT_TABLES, ExportReadError, collectUserData, exportUserData } from "@/lib/exportUserData";

type Result = { data: unknown[] | null; error: { message: string } | null };

const queried: { table: string; select: string; eq: [string, string][]; range: [number, number] }[] = [];
let respond: (table: string, from: number) => Result = () => ({ data: [], error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (select: string) => {
        const call = { table, select, eq: [] as [string, string][], range: [0, 0] as [number, number] };
        const builder = {
          eq: (col: string, val: string) => {
            call.eq.push([col, val]);
            return builder;
          },
          order: () => builder,
          range: (from: number, to: number) => {
            call.range = [from, to];
            queried.push(call);
            return Promise.resolve(respond(table, from));
          },
        };
        return builder;
      },
    }),
  },
}));

const user = { id: "user-1", email: "parent@example.com" };
const LEGACY_KEYS = [
  "children", "sleepLogs", "feedingLogs", "diaperLogs", "milestones", "speechJournal",
  "illnessLogs", "medicationLogs", "chatConversations", "financeFinder", "accountStatus",
];

let createObjectURL: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queried.length = 0;
  respond = (table, from) => ({ data: from === 0 ? [{ table }] : [], error: null });
  createObjectURL = vi.fn(() => "blob:export");
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => click.mockRestore());

describe("EXPORT_TABLES", () => {
  it("never includes credential or token tables or columns", () => {
    for (const entry of EXPORT_TABLES) {
      expect(entry.table).not.toMatch(/token|secret/i);
      expect(entry.select ?? "").not.toMatch(/token|secret|invite_code/i);
    }
    // These two tables hold credentials, so they must use an explicit column list, never "*".
    expect(EXPORT_TABLES.find((e) => e.table === "profiles")?.select).toBeDefined();
    expect(EXPORT_TABLES.find((e) => e.table === "partner_invitations")?.select).toBeDefined();
  });

  it("has unique keys and keeps every previously exported key", () => {
    const keys = EXPORT_TABLES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of LEGACY_KEYS) expect(keys).toContain(k);
  });
});

describe("exportUserData", () => {
  it("queries every table in the list and downloads a payload whose keys match it", async () => {
    const payload = await collectUserData(user);

    expect(new Set(queried.map((q) => q.table))).toEqual(new Set(EXPORT_TABLES.map((e) => e.table)));
    expect(Object.keys(payload).sort()).toEqual(
      ["exportedAt", "account", ...EXPORT_TABLES.map((e) => e.key)].sort(),
    );
    expect(payload.account).toEqual({ email: user.email, id: user.id });
    expect(payload.sleepLogs).toEqual([{ table: "sleep_logs" }]);
    expect(queried.find((q) => q.table === "profiles")?.eq).toEqual([["id", "user-1"]]);

    await exportUserData(user);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("pages past the server row cap instead of truncating", async () => {
    respond = (table, from) =>
      table === "sleep_logs" && from < 2
        ? { data: [{ n: from }], error: null }
        : { data: [], error: null };

    const payload = await collectUserData(user);
    expect(payload.sleepLogs).toEqual([{ n: 0 }, { n: 1 }]);
  });

  it("downloads nothing and names the table when one read fails", async () => {
    respond = (table) =>
      table === "allergen_reactions"
        ? { data: null, error: { message: "permission denied" } }
        : { data: [], error: null };

    const err = await exportUserData(user).catch((e) => e);

    expect(err).toBeInstanceOf(ExportReadError);
    expect(err.failed).toEqual([
      { table: "allergen_reactions", label: "allergen reactions", message: "permission denied" },
    ]);
    expect(err.message).toContain("allergen reactions");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
