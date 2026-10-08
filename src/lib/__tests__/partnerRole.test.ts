import { describe, it, expect } from "vitest";
import { PARTNER_ROLES, ROLE_COPY, roleChangedMessage, toPartnerRole } from "@/lib/partnerInvite";

describe("toPartnerRole", () => {
  it("keeps known roles", () => {
    for (const r of PARTNER_ROLES) expect(toPartnerRole(r)).toBe(r);
  });

  it("treats a legacy null role as co-parent", () => {
    expect(toPartnerRole(null)).toBe("coparent");
    expect(toPartnerRole(undefined)).toBe("coparent");
  });

  it("maps an unknown value to co-parent, matching the old label fallback", () => {
    expect(toPartnerRole("owner")).toBe("coparent");
  });
});

describe("roleChangedMessage", () => {
  it("reads naturally for each role", () => {
    expect(roleChangedMessage("sam@example.com", "coparent")).toBe("sam@example.com is now a Co-parent.");
    expect(roleChangedMessage("sam@example.com", "caregiver")).toBe("sam@example.com is now a Caregiver.");
    expect(roleChangedMessage("sam@example.com", "viewer")).toBe("sam@example.com is now View-only.");
  });
});

describe("ROLE_COPY subs", () => {
  it("match the legal-approved copy", () => {
    expect(ROLE_COPY.coparent.sub).toBe("Everything except managing your team");
    expect(ROLE_COPY.caregiver.sub).toBe("Nanny · Sitter · Grandparent");
    expect(ROLE_COPY.viewer.sub).toBe("Grandparent · Family friend");
  });
});
