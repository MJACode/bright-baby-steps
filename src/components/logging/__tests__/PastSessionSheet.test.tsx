import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PastSessionSheet, type PastSessionValue } from "@/components/logging/PastSessionSheet";

const setup = (onSave: (v: PastSessionValue) => Promise<void> = async () => {}) =>
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
    />,
  );

// `min={0}` stops the steppers but not the keyboard. Typing "-5" into Hours
// used to make the duration negative, which derived a start hours in the
// future and blamed the end time for something typed into Hours.
describe("PastSessionSheet custom duration", () => {
  it("ignores a typed negative hour instead of deriving a start in the future", async () => {
    const onSave = vi.fn<(v: PastSessionValue) => Promise<void>>(async () => {});
    setup(onSave);
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));

    // "Other" seeds from the live duration, so this leaves 0h 45m.
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "-5" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save nap" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { startAt, durationMin } = onSave.mock.calls[0][0];
    expect(durationMin).toBe(45);
    expect(startAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("asks for a length when every custom field is negative", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));

    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "-5" } });
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "-30" } });

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
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "25" } });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("That's longer than a day. Check the times.");

    const save = screen.getByRole("button", { name: "Save nap" });
    expect(save).toBeDisabled();
    expect(alert.parentElement).toContainElement(save);
  });

  it("keeps the length helper with Save too", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Minutes"), { target: { value: "0" } });

    const helper = screen.getByText("Pick how long it lasted.");
    const save = screen.getByRole("button", { name: "Save nap" });
    expect(save).toBeDisabled();
    expect(helper.parentElement).toContainElement(save);
  });
});
