import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ChildContextPage from "@/pages/dashboard/ChildContextPage";

const state = vi.hoisted(() => ({ userId: "owner-1" }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock("@/hooks/useChildren", () => ({
  useChildren: () => ({
    activeChild: {
      id: "child-a",
      name: "Ada Lovelace",
      parent_id: "owner-1",
      interests: ["music"],
      temperament: null,
    },
  }),
}));
vi.mock("@/hooks/useChildMemories", () => ({
  useChildMemories: () => ({ deleteAllForChild: { isPending: false, mutate: vi.fn() } }),
}));
vi.mock("@/components/AddChildDialog", () => ({
  AddChildDialog: ({ open }: { open?: boolean }) => (open ? <div role="dialog">edit child</div> : null),
}));

function renderPage() {
  render(
    <MemoryRouter>
      <ChildContextPage />
    </MemoryRouter>,
  );
}

const editOrDelete = () => screen.queryByRole("button", { name: "Edit or delete Ada's profile" });

describe("ChildContextPage edit-or-delete entry", () => {
  it("opens the Edit Child dialog for the account owner", () => {
    state.userId = "owner-1";
    renderPage();
    expect(screen.queryByRole("link", { name: /manage child data/i })).toBeNull();
    fireEvent.click(editOrDelete()!);
    expect(screen.getByRole("dialog")).toHaveTextContent("edit child");
  });

  it("is hidden from an invited partner", () => {
    state.userId = "partner-1";
    renderPage();
    expect(editOrDelete()).toBeNull();
  });
});
