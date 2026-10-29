import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MobileDateTimePicker, WheelColumn } from "@/components/MobileDateTimePicker";

const at = (h: number, m: number) => {
  const d = new Date(2026, 9, 29);
  d.setHours(h, m, 0, 0);
  return d;
};

afterEach(() => vi.useRealTimers());

describe("MobileDateTimePicker wheels wrap around", () => {
  it("arrow up from hour 1 goes to 12, arrow down from minute 59 goes to 00", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MobileDateTimePicker value={at(13, 59)} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Hour" }), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(at(12, 59)); // 1 PM -> 12 PM

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Minute" }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(at(13, 0)); // :59 -> :00, hour unchanged

    rerender(<MobileDateTimePicker value={at(12, 0)} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Hour" }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(at(13, 0)); // 12 PM -> 1 PM
  });

  it("exposes each value once to queries despite the repeated copies", () => {
    render(<MobileDateTimePicker value={at(15, 13)} onChange={vi.fn()} />);
    const hour = screen.getByRole("spinbutton", { name: "Hour" });
    expect(within(hour).getAllByRole("button")).toHaveLength(12);
    expect(within(screen.getByRole("spinbutton", { name: "Minute" })).getAllByRole("button")).toHaveLength(60);
  });

  it("scrolling up past the first value lands on the last and recenters", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const opts = ["1", "2", "3"].map((v) => ({ value: v, label: v }));
    render(<WheelColumn loop ariaLabel="N" value="1" options={opts} onChange={onChange} />);
    const el = screen.getByRole("spinbutton", { name: "N" });
    const start = el.scrollTop; // middle copy, value "1"
    expect(start).toBeGreaterThan(0);

    el.scrollTop = start - 48; // one row up: previous copy's "3"
    fireEvent.scroll(el);
    act(() => vi.advanceTimersByTime(150));

    expect(onChange).toHaveBeenCalledWith("3");
    expect(el.scrollTop).toBe(start + 2 * 48); // "3" in the middle copy
  });

  it("non-looping wheels still stop at the ends", () => {
    const onChange = vi.fn();
    const opts = ["0", "1"].map((v) => ({ value: v, label: v }));
    render(<WheelColumn ariaLabel="N" value="0" options={opts} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "N" }), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("0");
  });
});

describe("WheelColumn loop recentering waits for the finger to lift", () => {
  it("does not move scrollTop mid-touch, recenters after touchend", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const opts = ["1", "2", "3"].map((v) => ({ value: v, label: v }));
    render(<WheelColumn loop ariaLabel="N" value="1" options={opts} onChange={onChange} />);
    const el = screen.getByRole("spinbutton", { name: "N" });
    const start = el.scrollTop;

    fireEvent.touchStart(el);
    el.scrollTop = start - 48;
    fireEvent.scroll(el);
    act(() => vi.advanceTimersByTime(150));
    expect(el.scrollTop).toBe(start - 48); // untouched while finger is down

    fireEvent.touchEnd(el);
    act(() => vi.advanceTimersByTime(150));
    expect(el.scrollTop).toBe(start + 2 * 48);
    expect(onChange).toHaveBeenCalledWith("3");
  });
});
