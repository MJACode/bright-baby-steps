import { HIGH_TEMP_F, isHighTemp, toFahrenheit } from "@/lib/temperature";

describe("temperature threshold", () => {
  it("converts Celsius and passes Fahrenheit through", () => {
    expect(toFahrenheit(37, "C")).toBeCloseTo(98.6, 5);
    expect(toFahrenheit(98.6, "F")).toBe(98.6);
  });

  it("treats the threshold itself as high", () => {
    expect(isHighTemp(HIGH_TEMP_F, "F")).toBe(true);
    expect(isHighTemp(100.3, "F")).toBe(false);
  });

  it("applies the same threshold in Celsius", () => {
    expect(isHighTemp(38, "C")).toBe(true);
    expect(isHighTemp(37, "C")).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(isHighTemp(Number.NaN, "F")).toBe(false);
  });
});
