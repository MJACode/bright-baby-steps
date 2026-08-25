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
