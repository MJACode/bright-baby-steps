import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  familyMemberLabel,
  nameInitials,
  resolveFamilyLabels,
  useLoggedByNames,
  UNKNOWN_FAMILY_MEMBER_LABEL,
} from "@/hooks/useLoggedByNames";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (_fn: string, _args: { _ids: string[] }) => ({
    data: [
      { id: "u-barbara", display_name: "Barbara", role: "caregiver" },
      { id: "u-owner", display_name: null, role: "owner" },
    ],
    error: null,
  })),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

describe("nameInitials", () => {
  it("takes the first letter of up to two words", () => {
    expect(nameInitials("Barbara")).toBe("B");
    expect(nameInitials("Mary Ann")).toBe("MA");
    expect(nameInitials("  mary   ann jo ")).toBe("MA");
    expect(nameInitials("Co-parent")).toBe("C");
    expect(nameInitials(UNKNOWN_FAMILY_MEMBER_LABEL)).toBe("FM");
  });

  it("uses only letters and digits, skipping words that have none", () => {
    expect(nameInitials("Lucia (nanny)")).toBe("LN");
    expect(nameInitials("— Ana")).toBe("A");
    expect(nameInitials("Émile 2nd")).toBe("É2");
  });
});

describe("familyMemberLabel", () => {
  it("uses the display name when set", () => {
    expect(familyMemberLabel({ id: "a", display_name: " Barbara ", role: "caregiver" })).toBe("Barbara");
  });

  it("falls back to the role when the name is blank", () => {
    expect(familyMemberLabel({ id: "a", display_name: null, role: "owner" })).toBe("Parent");
    expect(familyMemberLabel({ id: "a", display_name: "  ", role: "coparent" })).toBe("Co-parent");
    expect(familyMemberLabel({ id: "a", display_name: null, role: "caregiver" })).toBe("Caregiver");
    expect(familyMemberLabel({ id: "a", display_name: null, role: "viewer" })).toBe("Caregiver");
  });

  it("labels ids the RPC didn't return as a family member", () => {
    expect(familyMemberLabel(undefined)).toBe(UNKNOWN_FAMILY_MEMBER_LABEL);
    expect(resolveFamilyLabels(["x"], [])).toEqual({ x: UNKNOWN_FAMILY_MEMBER_LABEL });
  });
});

describe("useLoggedByNames", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => rpc.mockClear());

  it("resolves other people's ids through the RPC and skips the current user", async () => {
    const { result } = renderHook(
      () => useLoggedByNames(["me", "u-barbara", "u-owner", "u-gone", null, "u-barbara"]),
      { wrapper },
    );
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(3));
    expect(result.current).toEqual({
      "u-barbara": "Barbara",
      "u-owner": "Parent",
      "u-gone": UNKNOWN_FAMILY_MEMBER_LABEL,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_family_display_names", {
      _ids: ["u-barbara", "u-gone", "u-owner"],
    });
  });

  it("fetches nothing when every row is the user's own", () => {
    const { result } = renderHook(() => useLoggedByNames(["me", "me"]), { wrapper });
    expect(result.current).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });
});
