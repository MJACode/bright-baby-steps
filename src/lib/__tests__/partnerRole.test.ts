import { describe, it, expect } from "vitest";

const insert = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => {
        insert(row);
        return { select: () => ({ single: async () => ({ data: { invite_code: "abc" }, error: null }) }) };
      },
    }),
  },
}));

import {
  PARTNER_ROLES,
  ROLE_COPY,
  CAREGIVER_COACH_COPY,
  buildInviteMessage,
  caregiverSeesCoach,
  createPartnerInvite,
  roleChangedMessage,
  toPartnerRole,
} from "@/lib/partnerInvite";

describe("PARTNER_ROLES", () => {
  it("offers co-parent and caregiver only", () => {
    expect(PARTNER_ROLES).toEqual(["coparent", "caregiver"]);
    expect(Object.keys(ROLE_COPY)).toEqual(["coparent", "caregiver"]);
  });
});

describe("toPartnerRole", () => {
  it("keeps known roles", () => {
    for (const r of PARTNER_ROLES) expect(toPartnerRole(r)).toBe(r);
  });

  it("falls back to co-parent for a missing role", () => {
    expect(toPartnerRole(null)).toBe("coparent");
    expect(toPartnerRole(undefined)).toBe("coparent");
  });

  it("maps an unknown value to co-parent, matching the old label fallback", () => {
    expect(toPartnerRole("owner")).toBe("coparent");
  });

  it("maps a legacy viewer to caregiver so the UI never overstates their access", () => {
    expect(toPartnerRole("viewer")).toBe("caregiver");
  });
});

describe("roleChangedMessage", () => {
  it("reads naturally for each role", () => {
    expect(roleChangedMessage("sam@example.com", "coparent")).toBe("sam@example.com is now a Co-parent.");
    expect(roleChangedMessage("sam@example.com", "caregiver")).toBe("sam@example.com is now a Caregiver.");
  });
});

describe("ROLE_COPY subs", () => {
  it("match the legal-approved copy", () => {
    expect(ROLE_COPY.coparent.sub).toBe("Same access as you");
    expect(ROLE_COPY.caregiver.sub).toBe("Nanny · Sitter · Grandparent");
  });
});

describe("CAREGIVER_COACH_COPY", () => {
  it("uses the founder-approved option names", () => {
    expect(CAREGIVER_COACH_COPY.off.title).toBe("Log only");
    expect(CAREGIVER_COACH_COPY.on.title).toBe("Log + sleep & feed coach");
  });
});

describe("buildInviteMessage", () => {
  it("names the role without mentioning view-only", () => {
    const base = { babyName: "Ada", url: "https://x/invite/abc" };
    expect(buildInviteMessage({ ...base, role: "coparent" })).toContain("added you as co-parent");
    expect(buildInviteMessage({ ...base, role: "caregiver" })).toContain("added you as caregiver");
  });
});

describe("caregiverSeesCoach", () => {
  it("needs a caregiver, the owner's choice, and the owner's Flare+", () => {
    expect(caregiverSeesCoach({ role: "caregiver", caregiverCoach: true, isChildOwnerPremium: true })).toBe(true);
  });

  it("is off when the owner chose Log only", () => {
    expect(caregiverSeesCoach({ role: "caregiver", caregiverCoach: false, isChildOwnerPremium: true })).toBe(false);
  });

  it("is off while Flare+ has lapsed, even with the choice kept", () => {
    expect(caregiverSeesCoach({ role: "caregiver", caregiverCoach: true, isChildOwnerPremium: false })).toBe(false);
  });

  it("ignores a stale flag on any other role", () => {
    for (const role of ["owner", "coparent", "viewer"]) {
      expect(caregiverSeesCoach({ role, caregiverCoach: true, isChildOwnerPremium: true })).toBe(false);
    }
  });
});

describe("createPartnerInvite", () => {
  beforeEach(() => insert.mockClear());

  it("stores the coach choice on a caregiver invite", async () => {
    await createPartnerInvite({ ownerId: "o", role: "caregiver", caregiverCoach: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ role: "caregiver", caregiver_coach: true }));
  });

  it("defaults a caregiver invite to Log only", async () => {
    await createPartnerInvite({ ownerId: "o", role: "caregiver" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ caregiver_coach: false }));
  });

  it("never stores the coach for a co-parent", async () => {
    await createPartnerInvite({ ownerId: "o", role: "coparent", caregiverCoach: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ role: "coparent", caregiver_coach: false }));
  });
});
