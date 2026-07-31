// The fever threshold and the sentence that goes with it are shared by the
// Records temperature editor and the quick-log sheet — one home so the two
// surfaces can never disagree about what counts as "above typical".
export const HIGH_TEMP_F = 100.4;

export const HIGH_TEMP_NOTE =
  "This reading is above the typical range. You know your baby best — when in doubt, your pediatrician is the best call. This isn't medical advice.";

export function toFahrenheit(value: number, unit: string): number {
  return unit === "C" ? (value * 9) / 5 + 32 : value;
}

export function isHighTemp(value: number, unit: string): boolean {
  return Number.isFinite(value) && toFahrenheit(value, unit) >= HIGH_TEMP_F;
}
