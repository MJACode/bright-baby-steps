# Per-child AI Memory — implementation plan

**Branch:** `claude/add-user-memory-pT3pf`

**Decisions (locked with user 2026-05-16):**
- Scope: per `child_id`. Both primary parent and active partners read/write the same memory thread via existing `public.can_access_child(auth.uid(), child_id)` SECURITY DEFINER function.
- Write path: auto-extracted after each AI turn — only on `chat`, `briefing`, `weekly-insights`. `parse-voice-log` and `detect-milestone` are one-shot parsers, skip.
- Visibility: dedicated **AI Memory** page linked from ProfilePage — list, pin, edit, delete.

---

## Backend (delegated to `backend` specialist)

- [ ] **Migration `20260516000000_child_memories.sql`**
  - `public.child_memories` table:
    - `id uuid PK default gen_random_uuid()`
    - `child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE`
    - `category text NOT NULL CHECK (category IN ('preference','trait','routine','concern','goal','context'))`
    - `content text NOT NULL CHECK (char_length(content) BETWEEN 3 AND 500)`
    - `source_function text` — `'chat' | 'briefing' | 'weekly-insights' | 'manual'`
    - `confidence real CHECK (confidence BETWEEN 0 AND 1)`
    - `pinned boolean NOT NULL DEFAULT false`
    - `created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`
    - `created_at timestamptz NOT NULL DEFAULT now()`
    - `updated_at timestamptz NOT NULL DEFAULT now()`
    - `last_referenced_at timestamptz`
  - Indexes: `(child_id, pinned DESC, created_at DESC)`, `(child_id, category)`.
  - `updated_at` trigger using whichever helper already exists in the codebase (`set_updated_at` or similar) — reuse, don't create new.
  - RLS — all gated on `public.can_access_child(auth.uid(), child_id)`:
    - SELECT — anyone with access.
    - INSERT — anyone with access; enforce `created_by = auth.uid()` via WITH CHECK.
    - UPDATE — anyone with access.
    - DELETE — anyone with access.
  - `delete_user_account` RPC: **no change needed** — `children ON DELETE CASCADE` already covers it transitively.

- [ ] **Edge function `supabase/functions/extract-memory/index.ts`** (new)
  - Input: `{ childId, transcript: Array<{role, content}>, sourceFunction }`.
  - Authenticates the caller JWT, then loads existing memories for `childId` (top 50 by `pinned DESC, created_at DESC`) via the user-session client so RLS verifies access.
  - One Anthropic `claude-haiku-4-5-20251001` call. System prompt:
    > Extract up to 5 durable facts about this child or the parent's preferences from the conversation. Skip ephemeral details (today's nap time, what they ate at one feeding). Skip anything already in the existing memory list. Output JSON array of `{category, content, confidence}` where category is one of preference, trait, routine, concern, goal, context.
  - Validate response, drop bad rows, insert via service-role client with `created_by = userIdFromJwt`.
  - Returns `204 No Content`. Idempotent on duplicate content (skip if same `content` already exists for that child).

- [ ] **Shared module `supabase/functions/_shared/memory.ts`** (new)
  - `loadMemoryContext(supabase, childId)` → string block, pinned + recent, cap at ~1500 tokens. Empty string when no rows.
  - `fireExtractMemory(jwt, childId, transcript, sourceFunction)` → fire-and-forget `fetch` to the `extract-memory` endpoint. **Must use `fetch`, not `supabase.functions.invoke`** per CLAUDE.md.

- [ ] **Wire into `chat/index.ts`**
  - Accept new optional `childId` from request body.
  - Append `loadMemoryContext(...)` output into `buildContextMessage`.
  - After stream closes, `EdgeRuntime.waitUntil(fireExtractMemory(...))` so the response isn't blocked.

- [ ] **Wire into `briefing/index.ts` and `weekly-insights/index.ts`**
  - Both already accept `childId`. Same load → inject → fire-and-forget pattern.

- [ ] **Regenerate `src/integrations/supabase/types.ts`** so the new table is typed for the frontend.

---

## Frontend (delegated to `frontend` specialist)

- [ ] **`AIChatWidget.tsx`** — add `child_id: childContext?.id` to the fetch body alongside `messages`, `skill`, `context`. No other changes; streaming pattern stays intact.

- [ ] **`src/hooks/useChildMemories.ts`** (new) — mirror `useChildren` shape:
  - `useChildMemories(childId)` → `{ memories, isLoading }` via react-query (`queryKey: ["child-memories", childId]`, `staleTime: 60_000`).
  - Mutations: `togglePin`, `updateContent`, `deleteMemory`, `deleteAllForChild`.
  - All Supabase calls go through the user session client — RLS does the access work.

- [ ] **`src/pages/dashboard/AIMemoryPage.tsx`** (new) at route `/dashboard/ai-memory`.
  - Display heading (Quicksand) + one-line plain-language explainer.
  - Child selector (reuse the existing child-switcher pattern — check `useChildren` consumers for the canonical component).
  - List grouped by `category` with: pin toggle, inline edit, delete, "Forget everything" destructive action behind shadcn `AlertDialog`.
  - Empty state: "Nothing remembered yet. As you chat, Grace Flare will remember durable facts about your baby here."
  - Brand compliance: Nunito body, Quicksand display heading only, `font-bold` weights, Forest Teal primary, `touch-target` on every interactive control.

- [ ] **`ProfilePage.tsx`** — add a settings row linking to `/dashboard/ai-memory` ("What Grace Flare remembers about your baby" → chevron).

- [ ] **Route registration** — add the lazy route alongside ProfilePage in the dashboard router.

---

## Privacy / Legal (delegated to `frontend` for the page edits, plus log)

- [ ] **`PrivacyPage.tsx` § 4** — append one sentence: "When you use AI chat, weekly insights, or your morning briefing, we extract a small set of durable facts about each child and store them in our database. You can view, edit, or delete these any time at Settings → AI Memory."
- [ ] **`docs/legal-review-log.md`** — append 2026-05-16 entry: AI memory feature, scope per-child, user can delete, cascade on child/account deletion, no DPA implications (still Anthropic-only), risk rated low.

---

## Verification

- [ ] `npm run build` (or `tsc -b`) passes locally.
- [ ] `qa` specialist agent pass on the full diff before commit.
- [ ] PR opens as a draft per repo policy.

---

## Out of scope (explicit)

- No memory in `parse-voice-log` or `detect-milestone` — they are one-shot parsers.
- No vector embeddings — flat recency + pinned is enough for v1.
- No automatic pruning cron — revisit when volume is observable.
- No per-user / per-partner private memory split — memories follow the same access pattern as all other child data.
