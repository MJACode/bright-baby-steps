import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Per-child memory extractor.
//
// Invoked fire-and-forget (via _shared/memory.ts → fireExtractMemory) by
// `chat`, `briefing`, and `weekly-insights` after each successful AI turn.
// Extracts up to 5 durable facts from the transcript, dedups against the
// caller's existing memory list, and writes the new rows to
// `public.child_memories`.
//
// Auth model:
//   - Validates Bearer JWT, derives `user.id` for the audit column.
//   - Loads the existing memory list via a USER-SESSION client so RLS via
//     `can_access_child` gates access. A 403/empty result short-circuits
//     extraction — the caller must have access to write back.
//   - Performs the final INSERT via the SERVICE-ROLE client so we can stamp
//     `created_by = user.id` reliably; the RLS check already happened on
//     the SELECT above.
//
// Returns 204 No Content on success even when zero rows are inserted —
// extraction is best-effort.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = new Set([
  "preference",
  "trait",
  "routine",
  "concern",
  "goal",
  "context",
]);
const MIN_CONTENT_LEN = 3;
const MAX_CONTENT_LEN = 500;
const MAX_EXTRACTED = 5;
const MAX_TRANSCRIPT_CHARS = 12000; // hard cap to bound the prompt

type ExtractedItem = {
  category: string;
  content: string;
  confidence: number;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) return jsonResponse({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // User-session client for the RLS-gated SELECT.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "invalid body" }, 400);
    }

    const { childId, transcript, sourceFunction } = body as {
      childId?: string;
      transcript?: Array<{ role: string; content: string }>;
      sourceFunction?: string;
    };

    if (!childId || typeof childId !== "string") {
      return jsonResponse({ error: "childId required" }, 400);
    }
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return jsonResponse({ error: "transcript required" }, 400);
    }
    if (
      sourceFunction !== "chat" &&
      sourceFunction !== "briefing" &&
      sourceFunction !== "weekly-insights"
    ) {
      return jsonResponse({ error: "invalid sourceFunction" }, 400);
    }

    // RLS-gated check + existing memory fetch via user-session client.
    // If the caller lacks `can_access_child`, this returns [] with no error
    // (RLS filter, not a permission error) — we still 403 to be explicit.
    const { data: existingMemories, error: selectErr } = await userClient
      .from("child_memories")
      .select("id, content, category")
      .eq("child_id", childId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (selectErr) {
      console.error("extract-memory select error:", selectErr);
      return jsonResponse({ error: "select failed" }, 500);
    }

    // Confirm the caller really can access this child. RLS only filters
    // child_memories; a non-existent / inaccessible child would also yield
    // []. Probe `children` directly via the user session client.
    const { data: childRow, error: childErr } = await userClient
      .from("children")
      .select("id")
      .eq("id", childId)
      .maybeSingle();

    if (childErr || !childRow) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    const existing = existingMemories ?? [];

    // Build the prompt.
    const existingList = existing.length === 0
      ? "(no existing memories)"
      : existing
          .map((m) => `- ${m.category}: ${m.content}`)
          .join("\n");

    const transcriptStr = transcript
      .map((t) => `${t.role.toUpperCase()}: ${typeof t.content === "string" ? t.content : ""}`)
      .join("\n\n")
      .slice(0, MAX_TRANSCRIPT_CHARS);

    const systemPrompt =
      `You extract durable facts about a specific child or the parent's persistent preferences from a parenting-app conversation. Return up to 5 facts as a JSON array of {category, content, confidence} where category is one of: preference, trait, routine, concern, goal, context. Skip ephemeral details (today's nap time, what they ate at one feeding, a single tantrum). Skip anything that semantically duplicates the existing memory list provided. Content must be 3-500 chars. Confidence is 0.0-1.0. If nothing durable is worth remembering, return [].`;

    const userMessage =
      `EXISTING MEMORIES:\n${existingList}\n\nCONVERSATION:\n\`\`\`\n${transcriptStr}\n\`\`\`\n\nReturn ONLY the JSON array — no markdown, no commentary.`;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("extract-memory: ANTHROPIC_API_KEY missing");
      // Best-effort — return 204 so callers' waitUntil doesn't log a hard failure.
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error("extract-memory Anthropic error:", aiRes.status, errTxt);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const aiJson = await aiRes.json();
    const rawText: string = aiJson?.content?.[0]?.text ?? "";

    let parsed: unknown;
    try {
      const cleaned = rawText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("extract-memory JSON parse error:", err, "raw:", rawText.slice(0, 500));
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!Array.isArray(parsed)) {
      console.error("extract-memory: response not an array", parsed);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Validate, normalize, dedup against existing.
    const existingNormalized = new Set(
      existing.map((m) => normalizeContent(m.content)),
    );
    const validated: ExtractedItem[] = [];
    const seenInBatch = new Set<string>();

    for (const item of parsed.slice(0, MAX_EXTRACTED)) {
      if (!item || typeof item !== "object") continue;
      const cat = String((item as { category?: unknown }).category ?? "").trim().toLowerCase();
      const content = String((item as { content?: unknown }).content ?? "").trim();
      const confidenceRaw = (item as { confidence?: unknown }).confidence;
      const confidence = typeof confidenceRaw === "number"
        ? confidenceRaw
        : Number(confidenceRaw);

      if (!VALID_CATEGORIES.has(cat)) continue;
      if (content.length < MIN_CONTENT_LEN || content.length > MAX_CONTENT_LEN) continue;
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;

      const norm = normalizeContent(content);
      if (existingNormalized.has(norm)) continue;
      if (seenInBatch.has(norm)) continue;
      seenInBatch.add(norm);

      validated.push({ category: cat, content, confidence });
    }

    if (validated.length === 0) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Insert via service-role client so the audit column is the real caller
    // even if RLS would have rejected (it won't — we already confirmed
    // can_access_child above), and so the INSERT can't be silently filtered.
    if (!serviceRoleKey) {
      console.error("extract-memory: SUPABASE_SERVICE_ROLE_KEY missing — skipping insert");
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const rows = validated.map((v) => ({
      child_id: childId,
      category: v.category,
      content: v.content,
      confidence: v.confidence,
      source_function: sourceFunction,
      created_by: user.id,
    }));

    const { error: insertErr } = await serviceClient
      .from("child_memories")
      .insert(rows);

    if (insertErr) {
      console.error("extract-memory insert error:", insertErr);
      // Still 204 — fire-and-forget contract.
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (err) {
    console.error("extract-memory unhandled error:", err);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeContent(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
