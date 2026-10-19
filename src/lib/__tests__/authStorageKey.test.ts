import { supabase } from "@/integrations/supabase/client";
import { AUTH_STORAGE_KEY } from "@/lib/offlineCache";

describe("AUTH_STORAGE_KEY", () => {
  // client.ts is auto-generated; if its project URL changes, the offline
  // session fallback and offline sign-out would silently stop working.
  it("is the key the generated Supabase client stores its session under", () => {
    expect((supabase.auth as unknown as { storageKey: string }).storageKey).toBe(AUTH_STORAGE_KEY);
  });
});
