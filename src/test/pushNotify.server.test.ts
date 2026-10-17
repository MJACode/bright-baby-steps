import { describe, expect, it, vi } from "vitest";

import type { ApnsResult } from "../../supabase/functions/_shared/apns";
import {
  GENERIC_PUSH_COPY,
  PUSH_COPY,
  PUSH_ROLES,
  buildPushPayload,
  fanOutPushes,
  partnerRoleGetsPush,
  pushCopyFor,
  recipientKey,
  type InsertedNotification,
  type PushDevice,
  type PushFanoutDeps,
} from "../../supabase/functions/_shared/pushNotify";

// check-notifications push fan-out, imported straight from
// supabase/functions/_shared (same pattern as signPlan.server.test.ts).

const tok = (c: string) => c.repeat(64);

const ROWS: InsertedNotification[] = [
  { id: "n1", user_id: "owner", child_id: "c1", type: "sleep_window_15min" },
  { id: "n2", user_id: "partner", child_id: "c1", type: "sleep_window_15min" },
];

const DEVICES: PushDevice[] = [
  { user_id: "owner", token: tok("a"), environment: "production" },
  { user_id: "owner", token: tok("b"), environment: "sandbox" },
  { user_id: "partner", token: tok("c"), environment: "production" },
  { user_id: "stranger", token: tok("d"), environment: "production" },
];

function deps(over: Partial<PushFanoutDeps> = {}): PushFanoutDeps & {
  send: ReturnType<typeof vi.fn>;
  pruneTokens: ReturnType<typeof vi.fn>;
  loadDevices: ReturnType<typeof vi.fn>;
} {
  return {
    enabled: true,
    pushEnabled: () => true,
    loadDevices: vi.fn(async (ids: string[]) => DEVICES.filter((d) => ids.includes(d.user_id))),
    pruneTokens: vi.fn(async () => {}),
    send: vi.fn(async (): Promise<ApnsResult> => ({ status: "sent" })),
    ...over,
  } as never;
}

describe("fanOutPushes", () => {
  it("sends one push per inserted row per recipient device, only for inserted rows", async () => {
    const d = deps();
    const stats = await fanOutPushes(ROWS, d);
    expect(stats).toMatchObject({ sent: 3, pruned: 0, failed: 0, optedOut: 0, disabled: false });
    const sentTo = d.send.mock.calls.map((c) => c[0]);
    expect(sentTo.sort()).toEqual([tok("a"), tok("b"), tok("c")]);
    expect(sentTo).not.toContain(tok("d"));
    // Device environment is passed through.
    expect(d.send.mock.calls.find((c) => c[0] === tok("b"))?.[1]).toBe("sandbox");
  });

  it("does nothing when no rows were inserted (e.g. all suppressed)", async () => {
    const d = deps();
    expect(await fanOutPushes([], d)).toMatchObject({ sent: 0 });
    expect(d.loadDevices).not.toHaveBeenCalled();
  });

  it("skips recipients with push_enabled = false", async () => {
    const d = deps({ pushEnabled: (uid) => uid !== "partner" });
    const stats = await fanOutPushes(ROWS, d);
    expect(stats).toMatchObject({ sent: 2, optedOut: 1 });
    expect(d.send.mock.calls.map((c) => c[0])).not.toContain(tok("c"));
    expect(d.loadDevices.mock.calls[0][0]).toEqual(["owner"]);
  });

  it("pushes nobody who hasn't opted in, without reading devices", async () => {
    const d = deps({ pushEnabled: () => false });
    expect(await fanOutPushes(ROWS, d)).toMatchObject({ sent: 0, optedOut: 2 });
    expect(d.loadDevices).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("prunes tokens APNs reports dead and keeps the rest", async () => {
    const d = deps({
      send: vi.fn(async (token: string): Promise<ApnsResult> =>
        token === tok("b") ? { status: "prune", reason: "Unregistered" } : { status: "sent" }
      ),
    });
    const stats = await fanOutPushes(ROWS, d);
    expect(stats).toMatchObject({ sent: 2, pruned: 1 });
    expect(d.pruneTokens).toHaveBeenCalledWith([tok("b")]);
  });

  it("does not retry a pruned token in a later batch of the same run", async () => {
    const rows: InsertedNotification[] = [
      { id: "n1", user_id: "partner", child_id: "c1", type: "diaper_reminder" },
      { id: "n2", user_id: "partner", child_id: "c1", type: "sleep_reminder" },
    ];
    const d = deps({
      concurrency: 1,
      send: vi.fn(async (): Promise<ApnsResult> => ({ status: "prune", reason: "Unregistered" })),
    });
    const stats = await fanOutPushes(rows, d);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(stats.pruned).toBe(1);
  });

  it("is a no-op, without reading devices, when APNs secrets are missing", async () => {
    const d = deps({ enabled: false });
    expect(await fanOutPushes(ROWS, d)).toMatchObject({ sent: 0, disabled: true });
    expect(d.loadDevices).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("counts failures and rejections without throwing", async () => {
    let i = 0;
    const d = deps({
      send: vi.fn(async (): Promise<ApnsResult> => {
        i++;
        if (i === 1) throw new Error("boom");
        if (i === 2) return { status: "failed", httpStatus: 500, reason: "InternalServerError" };
        return { status: "sent" };
      }),
    });
    expect(await fanOutPushes(ROWS, d)).toMatchObject({ sent: 1, failed: 2, pruned: 0 });
    expect(d.pruneTokens).not.toHaveBeenCalled();
  });

  it("caps in-flight sends at the concurrency limit", async () => {
    const many: PushDevice[] = Array.from({ length: 25 }, (_, k) => ({
      user_id: "owner",
      token: k.toString(16).padStart(64, "0"),
      environment: "production",
    }));
    let inFlight = 0;
    let peak = 0;
    const d = deps({
      loadDevices: vi.fn(async () => many),
      send: vi.fn(async (): Promise<ApnsResult> => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return { status: "sent" };
      }),
    });
    const stats = await fanOutPushes([ROWS[0]], d);
    expect(stats.sent).toBe(25);
    expect(peak).toBeLessThanOrEqual(10);
  });

  it("chunks device lookups at 200 user ids", async () => {
    const rows = Array.from({ length: 450 }, (_, k) => ({
      id: `n${k}`,
      user_id: `u${k}`,
      child_id: null,
      type: "diaper_reminder",
    }));
    const d = deps({ loadDevices: vi.fn(async () => []) });
    await fanOutPushes(rows, d);
    expect(d.loadDevices.mock.calls.map((c) => c[0].length)).toEqual([200, 200, 50]);
  });
});

describe("push gating (viewer role, quiet hours)", () => {
  // Mirrors the check-notifications wiring: viewer copies are recorded in a
  // (partner, child) set during the partner fan-out; quiet-hours recipients in
  // a user set from the restraint filter. Both rows were already INSERTED
  // (in-app) by the time fanOutPushes sees them.
  const partnerRows: InsertedNotification[] = [
    { id: "o", user_id: "owner", child_id: "c1", type: "diaper_reminder" },
    { id: "v", user_id: "viewer", child_id: "c1", type: "diaper_reminder" },
    { id: "p", user_id: "coparent", child_id: "c1", type: "diaper_reminder" },
  ];
  const partnerDevices: PushDevice[] = [
    { user_id: "owner", token: tok("1"), environment: "production" },
    { user_id: "viewer", token: tok("2"), environment: "production" },
    { user_id: "coparent", token: tok("3"), environment: "production" },
  ];
  const loadDevices = vi.fn(async (ids: string[]) => partnerDevices.filter((d) => ids.includes(d.user_id)));

  function gate(roles: Record<string, string>, quietUsers = new Set<string>()) {
    const noPush = new Set<string>();
    for (const [partnerId, role] of Object.entries(roles)) {
      if (!partnerRoleGetsPush(role)) noPush.add(recipientKey(partnerId, "c1"));
    }
    return (row: InsertedNotification) =>
      quietUsers.has(row.user_id) || noPush.has(recipientKey(row.user_id, row.child_id));
  }

  it("PUSH_ROLES: coparent and caregiver push, viewer never does", () => {
    expect([...PUSH_ROLES].sort()).toEqual(["caregiver", "coparent"]);
    expect(partnerRoleGetsPush("coparent")).toBe(true);
    expect(partnerRoleGetsPush("caregiver")).toBe(true);
    expect(partnerRoleGetsPush("viewer")).toBe(false);
    expect(partnerRoleGetsPush(null)).toBe(false);
    expect(partnerRoleGetsPush("bogus")).toBe(false);
  });

  it("viewer copy (inserted in-app) is not pushed; coparent and owner are", async () => {
    const d = deps({ loadDevices, holdPush: gate({ viewer: "viewer", coparent: "coparent" }) });
    const stats = await fanOutPushes(partnerRows, d);
    expect(stats).toMatchObject({ sent: 2, held: 1 });
    expect(d.send.mock.calls.map((c) => c[0]).sort()).toEqual([tok("1"), tok("3")]);
  });

  it("viewer hold is per child: the same person as a coparent elsewhere still gets pushed", async () => {
    const rows: InsertedNotification[] = [
      { id: "a", user_id: "viewer", child_id: "c1", type: "diaper_reminder" },
      { id: "b", user_id: "viewer", child_id: "c2", type: "diaper_reminder" },
    ];
    const d = deps({ loadDevices, holdPush: gate({ viewer: "viewer" }) });
    expect(await fanOutPushes(rows, d)).toMatchObject({ sent: 1, held: 1 });
  });

  it("an appointment_reminder that survived quiet hours stays in-app only", async () => {
    const rows: InsertedNotification[] = [
      { id: "q", user_id: "owner", child_id: "c1", type: "appointment_reminder" },
      { id: "r", user_id: "coparent", child_id: "c1", type: "appointment_reminder" },
    ];
    const d = deps({ loadDevices, holdPush: gate({ coparent: "coparent" }, new Set(["owner"])) });
    const stats = await fanOutPushes(rows, d);
    expect(stats).toMatchObject({ sent: 1, held: 1 });
    expect(d.send.mock.calls.map((c) => c[0])).toEqual([tok("3")]);
  });

  it("does not read devices when every row is held", async () => {
    const d = deps({ loadDevices, holdPush: () => true });
    loadDevices.mockClear();
    expect(await fanOutPushes(partnerRows, d)).toMatchObject({ sent: 0, held: 3 });
    expect(loadDevices).not.toHaveBeenCalled();
  });
});

describe("push copy (lock-screen rule)", () => {
  // Every type check-notifications produces (TYPE_CATEGORY keys minus the
  // retired daily_briefing / reactivate-nudge's reactivation) plus
  // allergen_maintenance.
  const PRODUCED = [
    "appointment_reminder",
    "milestone_age",
    "weekly_development",
    "diaper_reminder",
    "sleep_reminder",
    "sleep_plan_winddown",
    "sleep_window_15min",
    "sleep_window_exceeded",
    "sleep_off_plan",
    "allergen_maintenance",
    "finance_trump_claim",
    "finance_529_newborn",
    "finance_529_birthday",
  ];

  it("has dedicated copy and an in-app route for every produced type", () => {
    for (const type of PRODUCED) {
      const copy = pushCopyFor(type);
      expect(copy, type).not.toBe(GENERIC_PUSH_COPY);
      expect(copy.route, type).toMatch(/^\/dashboard(\/[a-z-]+)?(\?tab=[a-z-]+)?$/);
    }
  });

  it("caregiver_note push is generic: no author, no note text", () => {
    expect(pushCopyFor("caregiver_note")).toEqual({
      title: "New note",
      body: "A caregiver left you a note.",
      route: "/dashboard",
    });
  });

  it("never interpolates anything: copy is fixed text with no placeholders", () => {
    for (const copy of Object.values(PUSH_COPY)) {
      expect(`${copy.title} ${copy.body}`).not.toMatch(/\$\{|\{|\}/);
    }
  });

  // Lock-screen denylist: every title/body, including the generic fallback.
  // Substring match on lower-cased text, so "nut" also catches "peanut",
  // "tree nut", "nuts"; "nap" is deliberately NOT listed (generic "nap
  // window" copy is fine), but nap *patterns* are.
  const ALL_COPY = [...Object.entries(PUSH_COPY), ["GENERIC", GENERIC_PUSH_COPY] as const];
  const DENYLIST = [
    // allergens
    "peanut", "egg", "milk", "dairy", "wheat", "gluten", "soy", "sesame", "fish", "shellfish", "nut",
    "allergen", "allergy", "allergic", "reaction", "hives", "rash", "epipen",
    // illness / meds
    "fever", "temperature", "medication", "medicine", "dose", "vaccine", "vaccination", "shot",
    "sick", "illness", "vomit", "diarrh", "symptom",
    // clinical / appointment kind
    "doctor", "pediatric", "clinic", "checkup", "check-up", "well visit", "well-child", "appointment",
    "visit prep", "therap", "speech", "delay", "diagnos",
    // sleep patterns (the child's data, not a generic nudge)
    "short nap", "trending", "later", "earlier", "regression", "night waking", "overtired",
    // growth / feeding detail
    "weight", "percentile", "formula", "breast",
  ];

  it.each(ALL_COPY)("%s: no placeholder and no denylisted health word", (_type, copy) => {
    for (const field of [copy.title, copy.body]) {
      expect(field).not.toContain("{");
      expect(field).not.toContain("${");
      const lower = field.toLowerCase();
      for (const word of DENYLIST) expect(lower, `"${field}" contains "${word}"`).not.toContain(word);
    }
  });

  it("appointment_reminder push says only that something is on the calendar", () => {
    expect(PUSH_COPY.appointment_reminder).toMatchObject({
      title: "Coming up on your calendar",
      body: "Tap to see what's next.",
    });
  });

  it("falls back to generic copy for unknown types (and is not fooled by prototype keys)", () => {
    expect(pushCopyFor("brand_new_type")).toBe(GENERIC_PUSH_COPY);
    expect(pushCopyFor("toString")).toBe(GENERIC_PUSH_COPY);
  });

  it("payload is minimal: fixed alert + route only (no child_id, notification_id or type)", () => {
    const payload = buildPushPayload({ id: "n9", user_id: "u", child_id: "c9", type: "allergen_maintenance" } as InsertedNotification);
    expect(payload).toEqual({
      aps: { alert: { title: "Keep it on the menu", body: PUSH_COPY.allergen_maintenance.body }, sound: "default" },
      route: "/dashboard/feeding?tab=allergens",
    });
    expect(Object.keys(payload).sort()).toEqual(["aps", "route"]);
    expect(JSON.stringify(payload)).not.toMatch(/c9|n9|allergen_maintenance/);
  });
});
