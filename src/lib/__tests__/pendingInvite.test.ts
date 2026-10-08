import { describe, it, expect, beforeEach } from "vitest";
import { stashPendingInvite, peekPendingInvite, clearPendingInvite } from "@/lib/partnerInvite";

describe("pending invite stash", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("round-trips a code through localStorage so it survives a cold start", () => {
    stashPendingInvite("abc123");
    expect(localStorage.getItem("pending_invite")).not.toBeNull();
    expect(peekPendingInvite()).toBe("abc123");
  });

  it("peek does not clear, so a re-render still finds the code", () => {
    stashPendingInvite("abc123");
    peekPendingInvite();
    expect(peekPendingInvite()).toBe("abc123");
  });

  it("clear removes the code", () => {
    stashPendingInvite("abc123");
    clearPendingInvite();
    expect(peekPendingInvite()).toBeNull();
  });

  it("stashing drops an older post-login redirect so it can't fire on a later login", () => {
    localStorage.setItem("post_login_redirect", "/oauth/consent?x=1");
    stashPendingInvite("abc123");
    expect(localStorage.getItem("post_login_redirect")).toBeNull();
  });

  it("ignores a stash older than the invite lifetime", () => {
    const t0 = Date.UTC(2026, 9, 1);
    stashPendingInvite("abc123", t0);
    expect(peekPendingInvite(t0 + 6 * 86_400_000)).toBe("abc123");
    expect(peekPendingInvite(t0 + 8 * 86_400_000)).toBeNull();
  });

  it("ignores a legacy plain-string stash", () => {
    localStorage.setItem("pending_invite", "abc123");
    expect(peekPendingInvite()).toBeNull();
  });

  it("returns null when nothing is stashed", () => {
    expect(peekPendingInvite()).toBeNull();
  });
});
