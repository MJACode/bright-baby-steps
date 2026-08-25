import { groupLogsByDay } from "@/lib/groupLogsByDay";

type Row = { id: string; at: string };

function localIso(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m - 1, d, h, min).toISOString();
}

describe("groupLogsByDay", () => {
  it("keys by the LOCAL calendar day, not UTC", () => {
    // 11:30pm local on Aug 22 is Aug 23 in UTC for western offsets.
    const rows: Row[] = [{ id: "a", at: localIso(2026, 8, 22, 23, 30) }];
    const groups = groupLogsByDay(rows, (r) => r.at);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-08-22");
    expect(groups[0].date.getHours()).toBe(0);
  });

  it("returns days newest first", () => {
    const rows: Row[] = [
      { id: "a", at: localIso(2026, 8, 20, 9) },
      { id: "b", at: localIso(2026, 8, 22, 9) },
      { id: "c", at: localIso(2026, 8, 21, 9) },
    ];
    expect(groupLogsByDay(rows, (r) => r.at).map((g) => g.key)).toEqual([
      "2026-08-22",
      "2026-08-21",
      "2026-08-20",
    ]);
  });

  it("preserves input order inside a day", () => {
    const rows: Row[] = [
      { id: "late", at: localIso(2026, 8, 22, 18) },
      { id: "early", at: localIso(2026, 8, 22, 6) },
    ];
    expect(groupLogsByDay(rows, (r) => r.at)[0].logs.map((r) => r.id)).toEqual(["late", "early"]);
  });

  it("skips days with no logs entirely", () => {
    const rows: Row[] = [
      { id: "a", at: localIso(2026, 8, 22, 9) },
      { id: "b", at: localIso(2026, 8, 19, 9) },
    ];
    expect(groupLogsByDay(rows, (r) => r.at).map((g) => g.key)).toEqual([
      "2026-08-22",
      "2026-08-19",
    ]);
  });

  it("drops unparseable dates instead of producing an Invalid Date group", () => {
    const rows: Row[] = [
      { id: "a", at: "not-a-date" },
      { id: "b", at: localIso(2026, 8, 22, 9) },
    ];
    const groups = groupLogsByDay(rows, (r) => r.at);
    expect(groups).toHaveLength(1);
    expect(groups[0].logs.map((r) => r.id)).toEqual(["b"]);
  });

  it("returns an empty array for no logs", () => {
    expect(groupLogsByDay([] as Row[], (r) => r.at)).toEqual([]);
  });
});
