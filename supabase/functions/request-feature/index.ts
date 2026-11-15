// "Request early access" for a hidden Flare+ feature (first: Baby Signs /
// Sign Language). Saves the request as a public.feedback row inserted with
// the caller's JWT (RLS is the write gate; no service-role key) and emails the
// founder via Resend. No child data is read or sent.
//
// Called from the app via
//   supabase.functions.invoke("request-feature", { body: { feature: "baby-signs" } })
// verify_jwt = true (supabase/config.toml), and the handler also verifies the
// caller with auth.getUser().
//
// Contract and all logic: ../_shared/requestFeature.ts (vitest-tested in
// src/test/requestFeature.server.test.ts).
//
// Secrets: RESEND_API_KEY, VPC_FROM_EMAIL (sender), FEATURE_REQUEST_TO_EMAIL
// (optional; defaults to Matt@graceflare.com). SUPABASE_URL and
// SUPABASE_ANON_KEY are platform-provided.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRequestFeature, type UserClientLike } from "../_shared/requestFeature.ts";

serve((req) =>
  handleRequestFeature(req, {
    env: (name) => Deno.env.get(name),
    createUserClient: (url, anonKey, authorization) =>
      createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as UserClientLike,
    fetch: (input, init) => fetch(input, init),
  })
);
