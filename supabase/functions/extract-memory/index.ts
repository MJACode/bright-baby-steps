import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { formatInterestsTemperament, loadChildCore } from "../_shared/childContext.ts";

// Per-child memory extractor.
//
// Invoked fire-and-forget (via _shared/memory.ts → fireExtractMemory) by
// `briefing` and `weekly-insights` after each successful generation. (`chat`
// no longer calls it: since 2026-10-06 chat only builds the one-shot Word
// Journal insight. "chat" stays accepted as a sourceFunction for
// compatibility with old rows / callers.)
//
// Extracts up to 3 durable facts the logs can't capture (likes/dislikes,
// soothing strategies, temperament, routines described in words, parent
// goals, family/care context), dedups against the existing memory list, and
// writes the new rows to `public.child_memories`. Log statistics, norm
// comparisons, comments on what was/wasn't logged, and anything diagnostic
// are rejected by the prompt and by a cheap code-side filter
// (looksLikeLogStatistic). Parents can no longer see or edit these notes in
// the UI, so the bar for saving one is deliberately high.
//
// Per-child cap: after a successful insert, auto-extracted, unpinned rows
// (source_function in chat / briefing / weekly-insights) beyond the newest
// MAX_AUTO_MEMORIES are deleted. Pinned, manual, and sleep-triage rows are
// never pruned.
//
// Auth model:
//   - Validates Bearer JWT, derives `user.id` for the audit column.
//   - All Supabase calls (SELECT existing memories, probe children for
//     access, INSERT new memories, DELETE over-cap rows) go through the
//     USER-SESSION client so RLS via `can_access_child(auth.uid(), child_id)`
//     AND the INSERT policy's `created_by = auth.uid()` check both apply.
//     The DELETE policy is `can_access_child(auth.uid(), child_id)` only (no
//     created_by check), so a partner's run can prune rows the primary
//     parent's run created and vice versa. No service-role dependency.
//
// Returns 204 No Content on success even when zero rows are inserted —
// extraction is best-effort.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// "concern" is deliberately absent: the DB still allows it (manual /
// sleep-triage rows), but auto-extracted concerns drift into diagnostic,
// health-judgment territory, which this extractor must not produce.
const VALID_CATEGORIES = new Set([
  "preference",
  "trait",
  "routine",
  "goal",
  "context",
]);
const MIN_CONTENT_LEN = 3;
const MAX_CONTENT_LEN = 200;
const MAX_EXTRACTED = 3;
const MAX_TRANSCRIPT_CHARS = 12000; // hard cap to bound the prompt
// Newest auto-extracted, unpinned memories kept per child.
const MAX_AUTO_MEMORIES = 20;
const AUTO_SOURCES = ["chat", "briefing", "weekly-insights"];

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

    // User-session client for every Supabase call below — RLS gates access.
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
    // []. loadChildCore reads `children` via the user session client, so a
    // null here means not-found / no-access / select-error. One round-trip
    // doubles as the access probe AND the structured-profile source below.
    const core = await loadChildCore(userClient, childId);
    if (!core) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    const existing = existingMemories ?? [];

    // Build the prompt.
    const existingList = existing.length === 0
      ? "(no existing memories)"
      : existing
          .map((m) => `- ${m.category}: ${m.content}`)
          .join("\n");

    // Structured profile fields (interests/temperament live as columns on
    // public.children, not as memories) — tell the extractor not to
    // re-extract them. Skip the block entirely when both fields are empty.
    const profileLine = formatInterestsTemperament(core);
    const structuredProfile = profileLine
      ? `\n\nSTRUCTURED PROFILE (already known — do not duplicate): ${profileLine}`
      : "";

    const transcriptStr = transcript
      .map((t) => `${t.role.toUpperCase()}: ${typeof t.content === "string" ? t.content : ""}`)
      .join("\n\n")
      .slice(0, MAX_TRANSCRIPT_CHARS);

    const systemPrompt = [
      "You save a small number of durable notes about a child that a baby-tracking app's logs cannot capture. The text you read is usually an AI briefing or weekly summary generated FROM the app's logs, so most of it is log data restated. That is never worth saving: the app already has the logs.",
      "",
      "SAVE only facts that stay true for months and could not be computed from feeding, sleep, diaper, or growth logs:",
      "- preference: likes and dislikes (foods, toys, songs, positions), and what soothes this child (e.g. \"Calms fastest with white noise and rocking\")",
      "- trait: temperament quirks (e.g. \"Startles easily at loud noises\")",
      "- routine: routines described in words, not times or counts (e.g. \"Bath, book, then bed\")",
      "- goal: something the parent says they are working toward (e.g. \"Parent wants to move to one nap\")",
      "- context: family or care setup (daycare, siblings, bilingual home, a grandparent who helps)",
      "",
      "NEVER save:",
      "- numbers, counts, durations, rates, or totals derived from logs (\"feeds about 10 times per 48 hours\", \"slept 24.6 hours\")",
      "- comparisons to norms, baselines, averages, percentiles, or what is typical for the age",
      "- anything about what the parent did or didn't log, track, or record",
      "- anything diagnostic, medical, or a judgment about health, growth, or development",
      "- anything about a single day, night, or week, or a trend that could change by the next summary",
      "- anything that duplicates the existing memories or the structured profile",
      "",
      "Write each note as one short, neutral sentence, ideally 140 characters or fewer (hard limit 200). Do not use the child's name.",
      "Return a JSON array of {category, content, confidence} with at most 3 items; confidence is 0.0-1.0. Returning [] is the normal, expected answer: only save a note when the text clearly states a durable fact from the list above.",
    ].join("\n");

    const userMessage =
      `EXISTING MEMORIES:\n${existingList}${structuredProfile}\n\nCONVERSATION:\n\`\`\`\n${transcriptStr}\n\`\`\`\n\nReturn ONLY the JSON array — no markdown, no commentary.`;

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
      if (looksLikeLogStatistic(content)) continue;
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

    // Insert via the user-session client so RLS (can_access_child + created_by
    // = auth.uid()) does its job as defence-in-depth. The DB-level dedupe
    // trigger added in 20260516010000_*.sql will silently skip same-content
    // re-inserts within a 30-day window even if our in-memory dedupe missed
    // them (e.g. because the existing row sat past row 50).
    const rows = validated.map((v) => ({
      child_id: childId,
      category: v.category,
      content: v.content,
      confidence: v.confidence,
      source_function: sourceFunction,
      created_by: user.id,
    }));

    const { error: insertErr } = await userClient
      .from("child_memories")
      .insert(rows);

    if (insertErr) {
      console.error("extract-memory insert error:", insertErr);
      // Still 204 — fire-and-forget contract.
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    await pruneAutoMemories(userClient, childId);

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

// Keep only the newest MAX_AUTO_MEMORIES auto-extracted, unpinned rows for
// this child. Pinned, manual, and sleep-triage rows are never touched (they
// are excluded by the filters on BOTH the select and the delete, so a row
// pinned between the two calls is still safe). Runs through the user-session
// client; RLS DELETE policy is `can_access_child(auth.uid(), child_id)`.
// Deletes in chunks of PRUNE_CHUNK ids so the DELETE's `id=in.(...)` query
// string stays well under gateway URL limits; loops until nothing is over
// the cap (bounded by PRUNE_MAX_PASSES). Best-effort: errors are logged and
// swallowed.
const PRUNE_CHUNK = 100;
const PRUNE_MAX_PASSES = 20;

type UserClient = ReturnType<typeof createClient>;

async function pruneAutoMemories(
  client: UserClient,
  childId: string,
): Promise<void> {
  try {
    for (let pass = 0; pass < PRUNE_MAX_PASSES; pass++) {
      const removed = await prunePass(client, childId);
      if (removed < PRUNE_CHUNK) return;
    }
  } catch (err) {
    console.error("extract-memory prune unhandled error:", err);
  }
}

// Returns how many ids it tried to delete; 0 on error so the loop stops.
async function prunePass(client: UserClient, childId: string): Promise<number> {
  const { data: overCap, error: selErr } = await client
    .from("child_memories")
    .select("id")
    .eq("child_id", childId)
    .eq("pinned", false)
    .in("source_function", AUTO_SOURCES)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(MAX_AUTO_MEMORIES, MAX_AUTO_MEMORIES + PRUNE_CHUNK - 1);

  if (selErr) {
    console.error("extract-memory prune select error:", selErr);
    return 0;
  }
  const ids = (overCap ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;

  const { error: delErr } = await client
    .from("child_memories")
    .delete()
    .eq("child_id", childId)
    .eq("pinned", false)
    .in("source_function", AUTO_SOURCES)
    .in("id", ids);

  if (delErr) {
    console.error("extract-memory prune delete error:", delErr);
    return 0;
  }
  return ids.length;
}

// Cheap backstop for the prompt rules: reject notes that talk about logging
// or read as log statistics / norm comparisons. Patterns are narrow on
// purpose ("3 days a week at daycare" or "big sister is 4" still pass).
const LOG_STAT_PATTERNS: RegExp[] = [
  /\b(logs?|logged|logging|recorded|tracked|tracking)\b/i,
  /\b(baseline|percentile|on average)\b/i,
  /\b(below|above|under|over)\s+(the\s+)?(typical|average|normal|expected)\b/i,
  /\d+(\.\d+)?\s*(h|hours?|hrs?|minutes?|mins?|times|oz|ounces?|ml|feeds?|feedings?|diapers?|%|percent)\b/i,
  /\bper\s+(\d+\s*)?(hours?|day|days|week|weeks|night)\b/i,
];

function looksLikeLogStatistic(content: string): boolean {
  return LOG_STAT_PATTERNS.some((re) => re.test(content));
}

function normalizeContent(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
