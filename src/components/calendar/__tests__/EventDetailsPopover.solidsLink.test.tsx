import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventDetailsPopover } from "@/components/calendar/EventDetailsPopover";
import type { DayEvent } from "@/hooks/useDayEvents";

vi.mock("@/hooks/useLoggedByNames", () => ({ useLoggedByNames: () => ({}) }));

const feed = (feedingType: string): DayEvent => ({
  kind: "feed",
  id: "f1",
  at: new Date(),
  source: "manual",
  parentId: null,
  feedingType,
  amountOz: null,
  durationMin: null,
  notes: null,
});

const editHref = (event: DayEvent) => {
  const { unmount } = render(
    <MemoryRouter>
      <EventDetailsPopover event={event} onClose={() => {}} />
    </MemoryRouter>,
  );
  const href = screen.getByRole("link", { name: /Food/ }).getAttribute("href");
  unmount();
  return href;
};

it("sends a solid to the Solids tab and a milk feed to Feeding", () => {
  expect(editHref(feed("solid"))).toBe("/dashboard/feeding?tab=solids");
  expect(editHref(feed("bottle"))).toBe("/dashboard/feeding");
});
