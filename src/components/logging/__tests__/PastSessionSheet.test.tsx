import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { PastSessionSheet, type PastSessionValue } from "@/components/logging/PastSessionSheet";

const setup = (
  onSave: (v: PastSessionValue) => Promise<void> = async () => {},
  overrides: Partial<React.ComponentProps<typeof PastSessionSheet>> = {},
) =>
  render(
    <PastSessionSheet
      open
      onOpenChange={() => {}}
      title="Add past nap"
      saveLabel="Save nap"
      accentClass="bg-sleep"
      durationPresets={[20, 30, 45, 60, 90, 120]}
      defaultDurationMin={45}
      softMaxMin={14 * 60}
      hardMaxMin={24 * 60}
      onSave={onSave}
      {...overrides}
    />,
  );

// The wheels are the only way to author a custom length, so pick off them the
// way a parent does rather than typing.
const spinTo = (wheel: "Hours" | "Minutes", label: string) =>
  fireEvent.click(
    within(screen.getByRole("spinbutton", { name: wheel })).getByRole("button", { name: label }),
  );

// The custom length used to be a pair of <input type="number">. Focusing one
// inside the drawer raises the iOS keypad, and nothing lifts a `position: fixed`
// sheet out from under it — the parent was left staring at a keypad with the
// sheet, Save included, hidden behind it. Wheels mean the length is picked, not
// typed, so the keyboard never opens on the path to Save.
describe("PastSessionSheet custom duration", () => {
  it("takes a custom length off wheels, with nothing to type on the way to Save", async () => {
    const onSave = vi.fn<(v: PastSessionValue) => Promise<void>>(async () => {});
    const { baseElement } = setup(onSave);
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));

    expect(baseElement.querySelector("input, textarea")).toBeNull();

    // "Other" opens on the live duration (0h 45m), so this leaves 1h 15m.
    spinTo("Hours", "1");
    spinTo("Minutes", "15");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save nap" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { startAt, durationMin } = onSave.mock.calls[0][0];
    expect(durationMin).toBe(75);
    expect(startAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("opens the wheels on the length already chosen", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "1h 30m" }));
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));

    expect(screen.getByRole("spinbutton", { name: "Hours" })).toHaveAttribute("aria-valuetext", "1");
    expect(screen.getByRole("spinbutton", { name: "Minutes" })).toHaveAttribute("aria-valuetext", "30");
  });

  it("asks for a length when both wheels sit at zero", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));

    spinTo("Hours", "0");
    spinTo("Minutes", "00");

    expect(screen.getByText("Pick how long it lasted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save nap" })).toBeDisabled();
  });
});

// "Add past nap" used to demand an end time, so a parent whose baby was still
// asleep had no way to log the start they'd missed.
describe("PastSessionSheet in-progress mode", () => {
  const inProgress = (onSave: (startAt: Date) => Promise<void>) => ({
    optionLabel: "Still napping",
    endedOptionLabel: "Already woke up",
    elapsedLabel: "Napping for",
    saveLabel: "Start nap timer",
    onSave,
  });

  const setupWithModes = (onStart: (startAt: Date) => Promise<void> = async () => {}) =>
    render(
      <PastSessionSheet
        open
        onOpenChange={() => {}}
        title="Log earlier nap"
        saveLabel="Save nap"
        accentClass="bg-sleep"
        durationPresets={[20, 30, 45, 60, 90, 120]}
        defaultDurationMin={45}
        softMaxMin={14 * 60}
        hardMaxMin={24 * 60}
        onSave={async () => {}}
        inProgress={inProgress(onStart)}
      />,
    );

  it("opens on the completed session, so the existing flow is unchanged", () => {
    setupWithModes();
    expect(screen.getByRole("radio", { name: "Already woke up" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Save nap" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "45m" })).toBeInTheDocument();
  });

  it("drops the length and end-time controls once the nap is still running", () => {
    setupWithModes();
    fireEvent.click(screen.getByRole("radio", { name: "Still napping" }));

    expect(screen.queryByRole("radio", { name: "45m" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Ended /)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a note" })).not.toBeInTheDocument();
    // The start still defaults to ~45 minutes back, but it now reads as time
    // already slept rather than a length the parent has to pick.
    expect(screen.getByText(/^Napping for \d+m$/)).toBeInTheDocument();
  });

  it("hands the start time to the timer instead of saving a finished nap", async () => {
    const onStart = vi.fn<(startAt: Date) => Promise<void>>(async () => {});
    setupWithModes(onStart);
    fireEvent.click(screen.getByRole("radio", { name: "Still napping" }));

    fireEvent.click(screen.getByRole("button", { name: "Start nap timer" }));

    await waitFor(() => expect(onStart).toHaveBeenCalled());
    const startAt = onStart.mock.calls[0][0];
    expect(startAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - startAt.getTime()).toBeLessThan(60 * 60_000);
  });

  it("blocks a start that reaches back into a logged sleep", () => {
    render(
      <PastSessionSheet
        open
        onOpenChange={() => {}}
        title="Log earlier nap"
        saveLabel="Save nap"
        accentClass="bg-sleep"
        durationPresets={[20, 30, 45, 60, 90, 120]}
        defaultDurationMin={45}
        softMaxMin={14 * 60}
        hardMaxMin={24 * 60}
        onSave={async () => {}}
        checkOverlap={(start) => ({ start, end: new Date(start.getTime() + 30 * 60_000) })}
        inProgress={inProgress(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Still napping" }));

    expect(screen.getByRole("alert")).toHaveTextContent("This overlaps a sleep from");
    expect(screen.getByRole("button", { name: "Start nap timer" })).toBeDisabled();
  });

  it("returns to the completed form when the parent switches back", () => {
    setupWithModes();
    fireEvent.click(screen.getByRole("radio", { name: "Still napping" }));
    fireEvent.click(screen.getByRole("radio", { name: "Already woke up" }));

    expect(screen.getByRole("radio", { name: "45m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save nap" })).toBeInTheDocument();
  });
});

describe("PastSessionSheet without the in-progress option", () => {
  it("shows no mode picker at all", () => {
    setup();
    expect(screen.queryByText("Where is it now?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save nap" })).toBeInTheDocument();
  });
});

// Both date-time pickers open at once are taller than the drawer, so a
// validation message in the scrolling body sits below the fold while the sticky
// footer keeps Save on screen. The parent taps a disabled button and sees no
// reason for it — which reads as "Save does nothing".
describe("PastSessionSheet validation visibility", () => {
  it("keeps the reason Save is disabled in the same container as Save", () => {
    setup(async () => {}, { hardMaxMin: 2 * 60 });
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    spinTo("Hours", "3");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("That's longer than 2 hours. Check the times.");

    const save = screen.getByRole("button", { name: "Save nap" });
    expect(save).toBeDisabled();
    expect(alert.parentElement).toContainElement(save);
  });

  it("keeps the length helper with Save too", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    spinTo("Hours", "0");
    spinTo("Minutes", "00");

    const helper = screen.getByText("Pick how long it lasted.");
    const save = screen.getByRole("button", { name: "Save nap" });
    expect(save).toBeDisabled();
    expect(helper.parentElement).toContainElement(save);
  });
});
