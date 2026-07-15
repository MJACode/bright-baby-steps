import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface StaleRow {
  user_id: string;
  child_id: string;
  child_name: string;
}

serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await sb.rpc("users_with_no_logs_since", { since: cutoff });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (stale && stale.length > 0) {
    const rows = (stale as StaleRow[]).map((row) => ({
      user_id: row.user_id,
      child_id: row.child_id,
      message: `Hi again 👋 ${row.child_name}'s log is one tap away whenever you're ready.`,
      type: "reactivation",
    }));
    const { error: insertError } = await sb.from("notifications").insert(rows);
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ inserted: stale?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
