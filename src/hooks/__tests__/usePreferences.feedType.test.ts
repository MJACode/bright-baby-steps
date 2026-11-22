import { renderHook } from "@testing-library/react";
import { usePreferences } from "@/hooks/usePreferences";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

beforeEach(() => localStorage.clear());

describe("usePreferences pinnedFeedType", () => {
  it("defaults pinnedFeedType to null and drops an unknown stored value", () => {
    expect(renderHook(() => usePreferences()).result.current.prefs.pinnedFeedType).toBeNull();
    localStorage.setItem("prefs_u1", JSON.stringify({ pinnedFeedType: "solid" }));
    expect(renderHook(() => usePreferences()).result.current.prefs.pinnedFeedType).toBeNull();
    localStorage.setItem("prefs_u1", JSON.stringify({ pinnedFeedType: "pump" }));
    expect(renderHook(() => usePreferences()).result.current.prefs.pinnedFeedType).toBe("pump");
  });
});
