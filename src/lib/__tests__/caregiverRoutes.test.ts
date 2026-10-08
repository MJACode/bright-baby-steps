import { describe, expect, it } from "vitest";
import { caregiverBackTarget } from "@/lib/caregiverRoutes";

describe("caregiverBackTarget", () => {
  it("lets caregivers into the three logging surfaces, back to home", () => {
    for (const path of ["/dashboard/sleep", "/dashboard/feeding", "/dashboard/diapers"]) {
      expect(caregiverBackTarget(path)).toEqual({ to: "/dashboard", label: null });
    }
  });

  it("sends sleep history back to Sleep", () => {
    expect(caregiverBackTarget("/dashboard/sleep/history")).toEqual({ to: "/dashboard/sleep", label: "Sleep" });
  });

  it("tolerates a trailing slash", () => {
    expect(caregiverBackTarget("/dashboard/diapers/")).toEqual({ to: "/dashboard", label: null });
  });

  it("keeps every other dashboard route on CaregiverHome", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/financial",
      "/dashboard/profile",
      "/dashboard/more",
      "/dashboard/medical",
      "/dashboard/analytics",
      "/dashboard/calendar",
      "/dashboard/milestones",
      "/dashboard/sleepy",
    ]) {
      expect(caregiverBackTarget(path)).toBeNull();
    }
  });
});
