import { render, screen } from "@testing-library/react";
import { SleepDurationHint } from "@/components/sleep/SleepDurationHint";

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);

describe("SleepDurationHint", () => {
  it("shows the total with no hint for an ordinary night", () => {
    render(<SleepDurationHint startAt={at(15, 19)} endAt={at(16, 6, 10)} sleepType="night" />);
    expect(screen.getByText("11h 10m")).toBeInTheDocument();
    expect(screen.queryByText(/Check AM\/PM/)).toBeNull();
  });

  it("flags the AM/PM mix-up from the bug report", () => {
    render(<SleepDurationHint startAt={at(15, 6)} endAt={at(16, 6, 10)} sleepType="night" />);
    expect(screen.getByText("24h 10m")).toBeInTheDocument();
    const hint = screen.getByText("That's over 24 hours. Check AM/PM on the start time.");
    expect(hint).toHaveClass("text-warning");
    expect(hint.closest("[aria-live='polite']")).not.toBeNull();
  });

  it("uses the nap threshold for naps", () => {
    render(<SleepDurationHint startAt={at(15, 10)} endAt={at(15, 14, 30)} sleepType="nap" />);
    expect(screen.getByText("That's longer than usual. Check AM/PM on the start time.")).toBeInTheDocument();
  });

  it("renders no total when end is not after start", () => {
    render(<SleepDurationHint startAt={at(15, 10)} endAt={at(15, 10)} sleepType="nap" />);
    expect(screen.queryByText(/Total/)).toBeNull();
    expect(screen.queryByText(/Check AM\/PM/)).toBeNull();
  });
});
