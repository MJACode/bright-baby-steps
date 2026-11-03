import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Upgrade from "@/pages/Upgrade";

vi.mock("@/hooks/usePremium", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/usePremium")>()),
  usePremium: () => ({ isPremium: true, isEarlyAccess: true, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));

describe("/upgrade during early access", () => {
  it("shows the early-access state with no price, trial, or purchase button", () => {
    const { container } = render(
      <MemoryRouter>
        <Upgrade />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Flare+ is free during early access" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Grace Flare" })).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/trial|subscribe|per month|per year/i);
  });
});
