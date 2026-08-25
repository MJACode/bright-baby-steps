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
