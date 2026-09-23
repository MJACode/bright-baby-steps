import { render, screen } from "@testing-library/react";
import { format, subDays } from "date-fns";
import { GroupedLogList } from "@/components/logging/GroupedLogList";

interface TestLog {
  id: string;
  logged_at: string;
}

const at = (daysAgo: number, hour: number): TestLog => {
  const d = subDays(new Date(), daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { id: `${format(d, "yyyy-MM-dd")}-${hour}`, logged_at: d.toISOString() };
};

const setup = (props: Partial<React.ComponentProps<typeof GroupedLogList<TestLog>>> = {}) =>
  render(
    <GroupedLogList<TestLog>
      logs={[at(1, 9), at(2, 9)]}
      isLoading={false}
      getDate={(log) => log.logged_at}
      summarize={(dayLogs) => `${dayLogs.length} naps`}
      renderRow={(log) => <div key={log.id}>{log.id}</div>}
      labels={{ unit: "nap", unitPlural: "naps" }}
      emptyState={<p>Tap to log a nap.</p>}
      hasEarlier={false}
      onShowEarlier={() => {}}
      onRetry={() => {}}
      {...props}
    />,
  );

describe("GroupedLogList footer", () => {
  it("counts only days that have logs when the window was truncated", () => {
    // Today has no logs, so the list renders a synthetic empty Today group on
    // top of the two days that do have entries. "Most recent N days" means N
    // days OF LOGS, so the count deliberately excludes that empty group and
    // will read one lower than the number of visible headers. Don't "fix" it to
    // match the header count.
    setup({ logs: [at(1, 9), at(2, 9)], truncated: true, hasEarlier: false });

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.getByText(/Showing your most recent 2 days\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show earlier days" })).not.toBeInTheDocument();
  });

  it("offers earlier days when the window came back whole", () => {
    setup({ truncated: false, hasEarlier: true });

    expect(screen.getByRole("button", { name: "Show earlier days" })).toBeInTheDocument();
    expect(screen.queryByText(/Showing your most recent/)).not.toBeInTheDocument();
  });

  it("says that's everything when the window is whole and nothing is older", () => {
    setup({ truncated: false, hasEarlier: false });

    expect(screen.getByText(/That's every nap you've logged\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show earlier days" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing your most recent/)).not.toBeInTheDocument();
  });
});

describe("GroupedLogList default expansion", () => {
  it("opens Today and leaves every past day collapsed", () => {
    setup({ logs: [at(0, 8), at(1, 9), at(2, 9)] });

    // Radix keeps closed content out of the tree, so a row that renders at all
    // belongs to an open day.
    expect(screen.getByText(at(0, 8).id)).toBeInTheDocument();
    expect(screen.queryByText(at(1, 9).id)).not.toBeInTheDocument();
    expect(screen.queryByText(at(2, 9).id)).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Today/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Yesterday/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("GroupedLogList focusDayKey", () => {
  const yesterdayKey = format(subDays(new Date(), 1), "yyyy-MM-dd");

  it("renders the given rows as the focused day, opened, with no footer", () => {
    // The page picks the rows — a night that started the evening before still
    // belongs to this day — so the list must not regroup them by start date.
    setup({ logs: [at(1, 9), at(2, 21)], hasEarlier: true, focusDayKey: yesterdayKey });

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Yesterday/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(at(1, 9).id)).toBeInTheDocument();
    expect(screen.getByText(at(2, 21).id)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show earlier days" })).not.toBeInTheDocument();
  });

  it("renders an empty focused day rather than the whole-list empty state", () => {
    setup({ logs: [], focusDayKey: yesterdayKey });

    expect(screen.getByRole("button", { name: /Yesterday/ })).toBeInTheDocument();
    expect(screen.getByText("Naps you log for this day will show up here.")).toBeInTheDocument();
    expect(screen.queryByText("Tap to log a nap.")).not.toBeInTheDocument();
  });
});
