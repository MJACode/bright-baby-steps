import {
  ROLE_UNRESOLVED_MESSAGE,
  VIEW_ONLY_MESSAGE,
  assertCanWrite,
} from "@/hooks/useCurrentRole";

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
