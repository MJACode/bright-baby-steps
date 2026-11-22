import { renderHook } from "@testing-library/react";
import { usePreferences } from "@/hooks/usePreferences";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

beforeEach(() => localStorage.clear());

describe("usePreferences feed type fields", () => {
  it("migrates a stored solid lastFeedingType to the default", () => {
    localStorage.setItem("prefs_u1", JSON.stringify({ lastFeedingType: "solid" }));
    const { result } = renderHook(() => usePreferences());
    expect(result.current.prefs.lastFeedingType).toBe("bottle");
  });

  it("keeps a valid lastFeedingType", () => {
    localStorage.setItem("prefs_u1", JSON.stringify({ lastFeedingType: "breast" }));
    const { result } = renderHook(() => usePreferences());
    expect(result.current.prefs.lastFeedingType).toBe("breast");
  });

  it("defaults pinnedFeedType to null and drops an unknown stored value", () => {
    expect(renderHook(() => usePreferences()).result.current.prefs.pinnedFeedType).toBeNull();
    localStorage.setItem("prefs_u1", JSON.stringify({ pinnedFeedType: "solid" }));
    expect(renderHook(() => usePreferences()).result.current.prefs.pinnedFeedType).toBeNull();
    localStorage.setItem("prefs_u1", JSON.stringify({ pinnedFeedType: "pump" }));
    expect(renderHook(() => usePreferences()).result.current.prefs.pinnedFeedType).toBe("pump");
  });
});
