import { describe, expect, it } from "vitest";
import { bearerMatchesSecret, timingSafeEqual } from "../../supabase/functions/_shared/serviceRoleAuth";

describe("bearerMatchesSecret", () => {
  const secret = "sb_secret_test_value_not_a_real_key";

  it("accepts the exact service-role bearer", () => {
    expect(bearerMatchesSecret(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a user JWT, a missing header, and an empty secret", () => {
    expect(bearerMatchesSecret("Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig", secret)).toBe(false);
    expect(bearerMatchesSecret(null, secret)).toBe(false);
    expect(bearerMatchesSecret(`Bearer ${secret}`, "")).toBe(false);
  });

  it("rejects a different length and a near match", () => {
    expect(timingSafeEqual(secret, secret + "x")).toBe(false);
    expect(timingSafeEqual(secret, secret.replace("test", "xxxx"))).toBe(false);
    expect(timingSafeEqual("same", "same")).toBe(true);
  });
});
