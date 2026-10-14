import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AddChildDialog } from "@/components/AddChildDialog";

// Radix Switch measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const state = vi.hoisted(() => ({
  children: [] as { id: string; name: string }[],
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: state.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/hooks/useChildren", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChildren")>();
  return {
    ...actual,
    useChildren: () => ({
      children: state.children,
      addChild: { isPending: false },
      updateChild: { isPending: false },
      deleteChild: { isPending: false, mutateAsync: state.mutateAsync },
    }),
  };
});

const ada = { id: "child-a", name: "Ada Lovelace", date_of_birth: "2026-01-01", parent_id: "owner-1" };

function renderDialog(child: typeof ada, onOpenChange = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/dashboard/child-context"]}>
      <Routes>
        <Route path="/dashboard" element={<p>dashboard home</p>} />
        <Route
          path="/dashboard/child-context"
          element={<AddChildDialog child={child} open onOpenChange={onOpenChange} />}
        />
      </Routes>
    </MemoryRouter>,
  );
  return { onOpenChange };
}

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Delete Ada's profile" }));
  return screen.getByRole("alertdialog");
}

beforeEach(() => {
  state.children = [{ id: "child-a", name: "Ada Lovelace" }, { id: "child-b", name: "Ben" }];
  state.mutateAsync.mockReset();
  state.toast.mockReset();
});

describe("Delete child action", () => {
  it("shows the action to the child's owner", () => {
    renderDialog(ada);
    expect(screen.getByRole("button", { name: "Delete Ada's profile" })).toBeInTheDocument();
  });

  it("hides the action from a partner or caregiver", () => {
    renderDialog({ ...ada, parent_id: "someone-else" });
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete Ada/ })).not.toBeInTheDocument();
  });

  it("keeps the destructive button disabled until the first name is typed", async () => {
    renderDialog(ada);
    const dialog = openConfirm();
    expect(dialog).toHaveTextContent("Delete Ada's profile?");
    expect(dialog).toHaveTextContent("This can't be undone. Your account and any other children stay.");

    const confirm = () => screen.getAllByRole("button", { name: "Delete Ada's profile" }).at(-1)!;
    const input = screen.getByLabelText("Type Ada to confirm");
    expect(confirm()).toBeDisabled();

    fireEvent.change(input, { target: { value: "Ad" } });
    expect(confirm()).toBeDisabled();
    fireEvent.change(input, { target: { value: "  ada " } });
    expect(confirm()).toBeEnabled();

    state.mutateAsync.mockResolvedValue({ id: "child-a" });
    fireEvent.click(confirm());
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith({ id: "child-a" }));
    expect(state.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("closes the edit dialog and confirms on success, staying put when other children remain", async () => {
    const { onOpenChange } = renderDialog(ada);
    openConfirm();
    fireEvent.change(screen.getByLabelText("Type Ada to confirm"), { target: { value: "Ada" } });
    state.mutateAsync.mockResolvedValue({ id: "child-a" });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Ada's profile" }).at(-1)!);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Ada's profile is deleted" }));
    expect(screen.queryByText("dashboard home")).not.toBeInTheDocument();
  });

  it("returns to the dashboard (onboarding) after the last child is deleted", async () => {
    state.children = [{ id: "child-a", name: "Ada Lovelace" }];
    renderDialog(ada);
    openConfirm();
    fireEvent.change(screen.getByLabelText("Type Ada to confirm"), { target: { value: "Ada" } });
    state.mutateAsync.mockResolvedValue({ id: "child-a" });
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Ada's profile" }).at(-1)!);

    await waitFor(() => expect(screen.getByText("dashboard home")).toBeInTheDocument());
  });

  it("surfaces a failed delete with next-step copy and leaves the confirm open", async () => {
    const { onOpenChange } = renderDialog(ada);
    openConfirm();
    fireEvent.change(screen.getByLabelText("Type Ada to confirm"), { target: { value: "Ada" } });
    state.mutateAsync.mockRejectedValue(new Error("Only the parent who added this child can delete their profile."));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete Ada's profile" }).at(-1)!);

    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't delete Ada's profile",
          description: "Only the parent who added this child can delete their profile.",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
