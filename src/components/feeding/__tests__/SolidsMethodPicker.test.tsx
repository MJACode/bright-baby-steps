import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SolidsMethodPicker, SOLIDS_METHOD_SAVE_ERROR } from "@/components/feeding/SolidsMethodPicker";
import type { Role } from "@/hooks/useCurrentRole";
import type { SolidsMethod } from "@/lib/mealPlan";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({ updateChild: { mutate: h.mutate, isPending: false } }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => h.toast(...args) }));

beforeEach(() => {
  h.mutate.mockReset();
  h.toast.mockReset();
});

// Stands in for the children refetch: a successful save feeds the new method back as the prop.
function Harness({ initial, role = "owner" }: { initial: SolidsMethod | null; role?: Role }) {
  const [method, setMethod] = useState(initial);
  h.mutate.mockImplementation((vars: { solids_method: SolidsMethod }, opts: { onSuccess?: () => void }) => {
    setMethod(vars.solids_method);
    opts.onSuccess?.();
  });
  return <SolidsMethodPicker childId="child-1" method={method} role={role} roleResolved />;
}

describe("SolidsMethodPicker", () => {
  it("asks inline when unset, with all three options and their descriptions", () => {
    render(<Harness initial={null} />);
    expect(screen.getByRole("heading", { name: "How does your baby eat solids?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Baby-led.*Soft finger foods your baby feeds themselves/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Traditional.*Spoon-fed purées and mashes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mix.*A bit of both — what most families do/ })).toBeInTheDocument();
  });

  it("writes children.solids_method and collapses to a chip", () => {
    render(<Harness initial={null} />);
    fireEvent.click(screen.getByRole("button", { name: /^Baby-led/ }));
    expect(h.mutate).toHaveBeenCalledWith({ id: "child-1", solids_method: "blw" }, expect.any(Object));
    expect(screen.queryByRole("heading", { name: /How does your baby/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Feeding style: Baby-led. Change" })).toBeInTheDocument();
  });

  it("the chip reopens the picker with the current choice marked, and a new pick saves", () => {
    render(<Harness initial="blw" />);
    fireEvent.click(screen.getByRole("button", { name: "Feeding style: Baby-led. Change" }));
    expect(screen.getByRole("button", { name: /^Baby-led/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Traditional/ }));
    expect(h.mutate).toHaveBeenCalledWith({ id: "child-1", solids_method: "traditional" }, expect.any(Object));
    expect(screen.getByRole("button", { name: "Feeding style: Traditional. Change" })).toBeInTheDocument();
  });

  it("re-picking the current choice or tapping Keep closes without a write", () => {
    render(<Harness initial="mix" />);
    fireEvent.click(screen.getByRole("button", { name: "Feeding style: Mix. Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep Mix" }));
    fireEvent.click(screen.getByRole("button", { name: "Feeding style: Mix. Change" }));
    fireEvent.click(screen.getByRole("button", { name: /^Mix/ }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Feeding style: Mix. Change" })).toBeInTheDocument();
  });

  it("toasts a save failure with what to do next", () => {
    h.mutate.mockImplementation((_vars: unknown, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(new Error("network down")),
    );
    render(<SolidsMethodPicker childId="child-1" method={null} role="owner" roleResolved />);
    fireEvent.click(screen.getByRole("button", { name: /^Mix/ }));
    expect(h.toast).toHaveBeenCalledWith({ title: SOLIDS_METHOD_SAVE_ERROR, variant: "destructive" });
  });

  it("maps an RLS 0-row update to access copy, not raw Postgres text", () => {
    h.mutate.mockImplementation((_vars: unknown, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }),
    );
    render(<SolidsMethodPicker childId="child-1" method={null} role="owner" roleResolved />);
    fireEvent.click(screen.getByRole("button", { name: /^Mix/ }));
    expect(h.toast.mock.calls[0][0].title).toMatch(/Only parents and caregivers who can edit/);
  });

  it("a viewer sees the style as text and is never asked", () => {
    const { rerender } = render(<SolidsMethodPicker childId="child-1" method="blw" role="viewer" roleResolved />);
    expect(screen.getByText(/Feeding style:/)).toHaveTextContent("Feeding style: Baby-led");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<SolidsMethodPicker childId="child-1" method={null} role="viewer" roleResolved />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows nothing writable while the role is still resolving", () => {
    render(<SolidsMethodPicker childId="child-1" method={null} role="owner" roleResolved={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
