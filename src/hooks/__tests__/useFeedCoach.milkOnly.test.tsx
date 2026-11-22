import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useFeedCoach } from "@/hooks/useFeedCoach";

type Row = { logged_at: string; feeding_type: string };

const h = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const neq: [string, unknown][] = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        neq: (col: string, val: unknown) => {
          neq.push([col, val]);
          return chain;
        },
        limit: async () => ({
          data: h.rows.filter((r) => neq.every(([c, v]) => r[c as keyof Row] !== v)).map((r) => ({ logged_at: r.logged_at })),
          error: null,
        }),
      };
      return chain;
    },
  },
}));

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

it("reads milk feeds only, so a solid lunch doesn't reset the last feed", async () => {
  h.rows = [
    { logged_at: ago(20), feeding_type: "solid" },
    { logged_at: ago(150), feeding_type: "bottle" },
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useFeedCoach({ id: "child-1", date_of_birth: "2026-06-01" }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.feeds).toHaveLength(1));
  expect(result.current.lastFeedAt?.toISOString()).toBe(h.rows[1].logged_at);
});
