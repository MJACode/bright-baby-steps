import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useChildren", () => ({ useChildren: () => ({ children: [{ id: "c1", name: "Lulu" }] }) }));

import { SyncFailuresSheet } from "@/components/OfflineSyncBanner";
import { createAppQueryClient } from "@/lib/queryClient";
import { describeSyncFailure, type SyncFailure, type SyncFailureKind } from "@/lib/offlineLogs";

const failure = (kind: SyncFailureKind): SyncFailure => ({
  rowId: `row-${kind}`,
  table: "feeding_logs",
  childId: "c1",
  kind,
  at: null,
  failedAt: "2026-10-18T10:00:00.000Z",
  writes: [],
});

function renderSheet(kind: SyncFailureKind) {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <SyncFailuresSheet failures={[failure(kind)]} open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SyncFailuresSheet", () => {
  it.each(["invalid", "gone"] as const)("offers no Try again for %s, only Discard", (kind) => {
    renderSheet(kind);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it.each(["overlap", "permission", "unknown"] as const)("offers Try again for %s", (kind) => {
    renderSheet(kind);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("permission failure copy", () => {
  it("doesn't assume the reader was invited by someone else", () => {
    const copy = describeSyncFailure({ table: "feeding_logs", kind: "permission" }, "Lulu");
    expect(`${copy.title} ${copy.body}`).not.toMatch(/invited/i);
    expect(copy.body).toMatch(/Lulu/);
  });
});
