// Per-child AI memory shared helpers.
//
// Used by `chat`, `briefing`, and `weekly-insights` edge functions to:
//   (1) inject "what we know about this child" into the system prompt as a
//       separate non-cached message block, and
//   (2) fire-and-forget the extraction call to `extract-memory` after each
//       AI turn completes successfully.
//
// All Supabase calls in `loadMemoryContext` use the caller's session client so
// RLS via `public.can_access_child(auth.uid(), child_id)` does the access work.
// The fire-and-forget `fireExtractMemory` uses raw `fetch` (NOT
// supabase.functions.invoke) per CLAUDE.md — invoke buffers the response and
// breaks SSE; here we don't even want to wait on the response at all.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// Ambient declaration so we can use Supabase Edge's `waitUntil` to keep the
// last_referenced_at UPDATE alive after the parent fn returns. Falls back to
// `await` when running under plain Deno (local dev / tests).
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil: (p: Promise<any>) => void } | undefined;

type MemoryRow = {
  id: string;
  category: string;
  content: string;
  pinned: boolean;
  created_at: string;
};

// Conservative chars-per-token estimate. 4 chars ≈ 1 token is the usual rule
// of thumb for English; we under-shoot slightly to leave headroom for the
// surrounding scaffold text.
const MAX_CONTEXT_TOKENS = 1500;
const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;

/**
 * Load the per-child memory context block to inject into AI system prompts.
 *
 * Selects up to 50 rows for `childId`, ordered `pinned DESC, created_at DESC`,
 * formats them as a bulleted block, truncates from the bottom (oldest
 * unpinned drops first) if the total exceeds ~1500 tokens, and stamps
 * `last_referenced_at = now()` on the rows it actually returned.
 *
 * Returns the empty string when the child has no memories — callers can
 * short-circuit and skip appending anything to the prompt.
 */
export async function loadMemoryContext(
  supabase: SupabaseClient,
  childId: string,
): Promise<string> {
  if (!childId) return "";

  const { data, error } = await supabase
    .from("child_memories")
    .select("id, category, content, pinned, created_at")
    .eq("child_id", childId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("loadMemoryContext select error:", error);
    return "";
  }

  const rows: MemoryRow[] = data ?? [];
  if (rows.length === 0) return "";

  // Build the block line-by-line and stop once we exceed the char cap. The
  // order is `pinned DESC, created_at DESC`, so dropping from the bottom
  // sheds the oldest unpinned rows first — exactly the truncation policy
  // the plan calls for.
  const header = "WHAT YOU KNOW ABOUT THIS CHILD:\n";
  const lines: string[] = [];
  const referencedIds: string[] = [];
  let charCount = header.length;

  for (const row of rows) {
    const label = capitalize(row.category);
    const prefix = row.pinned ? "[pinned] " : "";
    const line = `- ${prefix}${label}: ${row.content}\n`;
    if (charCount + line.length > MAX_CONTEXT_CHARS) break;
    lines.push(line);
    referencedIds.push(row.id);
    charCount += line.length;
  }

  if (referencedIds.length === 0) return "";

  // Stamp last_referenced_at on the rows we actually surfaced. We want this
  // off the critical path (the caller is about to do a slow Anthropic round-
  // trip) but it MUST land — `last_referenced_at` is what the eviction policy
  // will lean on once row counts grow. On the Supabase Edge runtime, hand the
  // promise to `EdgeRuntime.waitUntil` so the worker isn't recycled before
  // the update completes; fall back to `await` under plain Deno.
  const updatePromise = supabase
    .from("child_memories")
    .update({ last_referenced_at: new Date().toISOString() })
    .in("id", referencedIds)
    // deno-lint-ignore no-explicit-any
    .then((res: any) => {
      if (res?.error) {
        console.error("loadMemoryContext last_referenced_at update error:", res.error);
      }
    });

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(updatePromise);
  } else {
    await updatePromise;
  }

  return header + lines.join("");
}

/**
 * Fire-and-forget call to the `extract-memory` edge function.
 *
 * Always resolves — extraction failures must never surface to the user or
 * fail the parent request. Use `EdgeRuntime.waitUntil(fireExtractMemory(...))`
 * at the call site so the parent function can return its response while the
 * extraction runs in the background.
 *
 * Uses raw `fetch` (NOT `supabase.functions.invoke`) per CLAUDE.md —
 * `invoke` buffers responses and is the wrong tool for streaming / fire-
 * and-forget patterns.
 */
export async function fireExtractMemory(
  jwt: string,
  childId: string,
  transcript: Array<{ role: string; content: string }>,
  sourceFunction: "chat" | "briefing" | "weekly-insights",
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) {
      console.error("fireExtractMemory: SUPABASE_URL not set");
      return;
    }
    if (!childId || !jwt) return;

    await fetch(`${supabaseUrl}/functions/v1/extract-memory`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ childId, transcript, sourceFunction }),
    });
  } catch (err) {
    // Swallow — fire-and-forget. Memory extraction failure must not surface
    // to the user.
    console.error("fireExtractMemory error (swallowed):", err);
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
