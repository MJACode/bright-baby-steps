import {
  ROLE_UNRESOLVED_MESSAGE,
  VIEW_ONLY_MESSAGE,
  assertCanWrite,
  fetchCurrentRole,
} from "@/hooks/useCurrentRole";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

type Row = Record<string, unknown> | null;

// Records each query's table, selected columns and eq filters, and answers
// from a per-table fixture.
function fakeClient(rows: { children: Row; partner_access: Row }) {
  const calls: { table: string; columns?: string; eq: [string, unknown][] }[] = [];
  const client = {
    from(table: "children" | "partner_access") {
      const call: (typeof calls)[number] = { table, eq: [] };
      calls.push(call);
      const chain = {
        select(columns: string) {
          call.columns = columns;
          return chain;
        },
        eq(col: string, val: unknown) {
          call.eq.push([col, val]);
          return chain;
        },
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return chain;
    },
  };
  return { client: client as unknown as Parameters<typeof fetchCurrentRole>[0], calls };
}

describe("fetchCurrentRole", () => {
  it("resolves the child's owner without reading partner_access", async () => {
    const { client, calls } = fakeClient({ children: { parent_id: "me" }, partner_access: null });
    await expect(fetchCurrentRole(client, "me", "c1")).resolves.toEqual({ role: "owner", caregiverCoach: false });
    expect(calls.map((c) => c.table)).toEqual(["children"]);
  });

  it("returns a caregiver's coach flag from their active seat", async () => {
    const { client, calls } = fakeClient({
      children: { parent_id: "owner" },
      partner_access: { role: "caregiver", caregiver_coach: true },
    });
    await expect(fetchCurrentRole(client, "me", "c1")).resolves.toEqual({ role: "caregiver", caregiverCoach: true });
    const access = calls.find((c) => c.table === "partner_access")!;
    expect(access.columns).toContain("caregiver_coach");
    expect(access.eq).toEqual(
      expect.arrayContaining([
        ["partner_id", "me"],
        ["owner_id", "owner"],
        ["status", "active"],
      ]),
    );
  });

  it("reads Log only as coach off", async () => {
    const { client } = fakeClient({
      children: { parent_id: "owner" },
      partner_access: { role: "caregiver", caregiver_coach: false },
    });
    await expect(fetchCurrentRole(client, "me", "c1")).resolves.toEqual({ role: "caregiver", caregiverCoach: false });
  });

  it("falls back to the no-write role with the coach off when there's no active seat", async () => {
    const { client } = fakeClient({ children: { parent_id: "owner" }, partner_access: null });
    await expect(fetchCurrentRole(client, "me", "c1")).resolves.toEqual({ role: "viewer", caregiverCoach: false });
  });
});

describe("assertCanWrite", () => {
  it("blames the pending query, not the user, while the role is unresolved", () => {
    // A failed background refetch drops isResolved back to false for a user who
    // was already resolved as owner — they must never be told they're view-only.
    expect(() => assertCanWrite(false, "owner")).toThrow(ROLE_UNRESOLVED_MESSAGE);
    expect(() => assertCanWrite(false, "viewer")).toThrow(ROLE_UNRESOLVED_MESSAGE);
  });

  it("tells a resolved viewer how to get edit access", () => {
    expect(() => assertCanWrite(true, "viewer")).toThrow(VIEW_ONLY_MESSAGE);
  });

  it("lets resolved writing roles through", () => {
    expect(() => assertCanWrite(true, "owner")).not.toThrow();
    expect(() => assertCanWrite(true, "coparent")).not.toThrow();
    expect(() => assertCanWrite(true, "caregiver")).not.toThrow();
  });
});
