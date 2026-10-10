import { describe, it, expect } from "vitest";
import { resolveAppUrl, PRODUCTION_APP_URL } from "@/lib/appUrl";

describe("resolveAppUrl", () => {
  it("uses VITE_APP_URL when it is set", () => {
    expect(
      resolveAppUrl({ envUrl: "https://staging.example.com", isNative: true, origin: "graceflare://localhost" }),
    ).toBe("https://staging.example.com");
  });

  it("never returns the app-scheme origin inside the iOS app", () => {
    expect(resolveAppUrl({ envUrl: undefined, isNative: true, origin: "graceflare://localhost" })).toBe(
      PRODUCTION_APP_URL,
    );
    expect(resolveAppUrl({ envUrl: "", isNative: true, origin: "capacitor://localhost" })).toBe(
      "https://graceflare.com",
    );
  });

  it("uses the page origin on the web", () => {
    expect(resolveAppUrl({ envUrl: undefined, isNative: false, origin: "http://localhost:5173" })).toBe(
      "http://localhost:5173",
    );
  });
});
