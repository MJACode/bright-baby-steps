// User-initiated account deletion (GDPR Art. 17 right to erasure).
//
// Why this lives in an edge function instead of being a direct RPC call:
//   The hosted Supabase project has the `storage.protect_delete()` trigger
//   which blocks `DELETE FROM storage.objects` even from SECURITY DEFINER
//   functions. We have to use the Storage admin API (HTTP path) to actually
//   purge `feedback-screenshots/{uid}/*` and `milestone-photos/{uid}/*`,
//   and HTTP calls don't belong in PL/pgSQL. So this function is the
//   orchestrator: verify the caller, list + remove storage objects via the
//   service-role storage client, then call the SQL `delete_user_account()`
//   RPC (which is itself SECURITY DEFINER and uses `auth.uid()`) using a
//   user-scoped client so the RPC sees the right uid.
//
// Required env vars (all set by Supabase by default):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const STORAGE_BUCKETS = ["feedback-screenshots", "milestone-photos"] as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Paginate Storage list calls — a single .list({ limit: 1000 }) silently leaves
// any extras behind, which would violate PrivacyPage § 8's "we delete all your
// files" promise for users with many milestone photos.
const STORAGE_PAGE_SIZE = 1000;

async function purgeUserStorage(
  admin: ReturnType<typeof createClient>,
  uid: string,
): Promise<{ bucket: string; deleted: number }[]> {
  const results: { bucket: string; deleted: number }[] = [];
  for (const bucket of STORAGE_BUCKETS) {
    let bucketDeleted = 0;
    let offset = 0;
    let pageHadError = false;
    // Loop until a page returns fewer rows than the page size. Each page is
    // deleted before fetching the next so we don't accumulate paths in memory.
    while (!pageHadError) {
      const { data: objects, error: listErr } = await admin.storage
        .from(bucket)
        .list(uid, { limit: STORAGE_PAGE_SIZE, offset });
      if (listErr) {
        console.error(`storage.list ${bucket}/${uid}/* failed`, listErr.message);
        pageHadError = true;
        break;
      }
      if (!objects || objects.length === 0) break;
      const paths = objects.map((o) => `${uid}/${o.name}`);
      const { error: removeErr } = await admin.storage.from(bucket).remove(paths);
      if (removeErr) {
        console.error(`storage.remove ${bucket}/${uid}/* failed`, removeErr.message);
        pageHadError = true;
        break;
      }
      bucketDeleted += paths.length;
      if (objects.length < STORAGE_PAGE_SIZE) break;
      // Remove + re-list at offset 0 also works, but remove() is eventually
      // consistent — advancing the offset is safer against duplicate work.
      offset += STORAGE_PAGE_SIZE;
    }
    results.push({ bucket, deleted: bucketDeleted });
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  // User-scoped client for identity check + RPC call. The RPC is SECURITY
  // DEFINER and reads auth.uid() from the JWT in this client.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }
  const uid = userData.user.id;

  // Service-role client for storage admin operations. Storage SDK calls
  // through the proper Storage HTTP path and is not blocked by the
  // protect_delete() trigger that blocks direct DELETE FROM storage.objects.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Storage cleanup first. If a bucket fails we log and continue — the SQL
  // helper will still run and the orphaned files can be swept later.
  const storageResults = await purgeUserStorage(admin, uid);

  const { error: rpcErr } = await userClient.rpc("delete_user_account");
  if (rpcErr) {
    console.error("delete_user_account rpc failed", uid, rpcErr.message);
    return jsonResponse(
      { error: "db_purge_failed", message: rpcErr.message, storage: storageResults },
      500,
    );
  }

  return jsonResponse({ ok: true, uid, storage: storageResults });
});
