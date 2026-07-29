# Juno-inspired features — Sick Day, Observations, Baseline, Narrative summary

Branch: `claude/junos-parents-kids-features-5j4iu5`
Full plan: see the approved plan file for rationale and verified findings.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

**The through-line.** Structured logs answer *how much*. The narration Grace Flare
currently discards answers *why* — which is what the parent wants and what the
pediatrician needs. The timer is the subject; the conversation is the predicate.

Grace Flare stays child-only. The in-app chat stays read-only — the conversational
path is Claude over MCP, not a chat we build and meter.

---

## Phase 1 — Sick Day CRUD (frontend, no migration)

`illness_logs` / `medication_logs` have correct RLS and four existing readers, and
no writer. This phase is the missing write UI.

- [x] `IllnessSection` in `src/components/records/MedicalTab.tsx`, modelled on
      `TemperatureSection`
- [x] Nested medication rows via `medication_logs.illness_log_id`, falling back to
      a standalone list when the parent illness is deleted (`ON DELETE SET NULL`)
- [x] `"illness-logs"` / `"medication-logs"` / `"child-context"` added to
      `LOG_WRITE_QUERY_KEYS` (the last one because `useChildContext` caches for 60s,
      so the AI would otherwise see a stale illness list)
- [x] Write controls gated on a **resolved** role, with the same guard inside each
      `mutationFn` — an RLS-blocked UPDATE returns 0 rows with no error and would
      otherwise toast a false success
- [x] QA pass — two rounds; Fix-required → Pass
- [x] Record the `medication_dose_events` deferral in the PR (decision, not oversight)

Shipped in `74dfef5`. Typecheck clean, 192/192 tests.

**Manual verification still outstanding** (needs a browser and three accounts):
owner sees all affordances; viewer sees rows read-only with no write controls;
coparent sees full controls. Plus a timezone check — log at 23:45 local and
confirm the card shows today, not tomorrow.

Gotchas: `date` not `timestamptz` (no `localInputToIso`); `dose` stays text;
validate `end_date >= start_date`; caregiver UI hiding is a UX guardrail, not a
security boundary.

---

### Tracked out of Phase 1 — client-stamped `parent_id` (app-wide, pre-existing)

Found during Phase 1 QA. Not introduced by this work and **not** fixed here,
because it affects every log table and fixing it only for illness would make that
table inconsistent with the rest.

Every write path stamps `parent_id: user.id` — `QuickLogFAB`, `useActiveSleep`,
`useActiveFeed`, `useVoiceLog`, and now `IllnessSection`. Two consequences,
both confirmed against the live database:

1. **INSERT is not role-enforced.** Policy is
   `((auth.uid() = parent_id) OR partner_can_write(parent_id))`. Because the client
   supplies its own uid as `parent_id`, the first disjunct is always true and
   `partner_can_write` — the clause that excludes viewers — never runs. The UI gate
   in `IllnessSection` is currently the only thing stopping a viewer write.
2. **Partner-written rows are invisible to the owner.** SELECT is
   `((auth.uid() = parent_id) OR has_partner_access(auth.uid(), parent_id))`, and
   `has_partner_access` is strictly directional while `accept_partner_invitation`
   (`20260507020000:48`) inserts exactly one row `(owner_id, partner_id)`. A
   co-parent's illness log would not appear for the child's owner.

**Blast radius today: zero.** Production has 0 active `partner_access` rows and 0
partner-written rows across `feeding_logs` / `sleep_logs` / `diaper_logs`. Nobody
has completed a partner invite, so there is nothing to backfill — this is the
cheapest it will ever be to fix.

- [ ] Decide the fix: stamp `parent_id` with the child's owner, or add a
      `WITH CHECK` requiring `child_id` to belong to a child the writer can write
      to (`can_access_child` already exists), or make `has_partner_access`
      symmetric. Pick one and apply it across all log tables at once.
- [ ] Until then, `IllnessSection`'s `canWrite` gate is load-bearing — say so in
      the comment rather than calling it a UX guardrail.

**Phase 1.5 covers 17 tables.** Pre-flight against live turned up more than the
original finding:

- **0 orphan/NULL `child_id` rows** anywhere — the pivot is safe, nothing to backfill.
- `journal_entries` and `reminders` **don't exist**; the harden migration's
  `to_regclass` guard skipped them silently.
- `temperature_logs`, `weight_logs` and `pediatrician_reminders` were **never
  hardened** and still carry single `FOR ALL` policies — viewers can write to
  them today, a second bug independent of the `parent_id` pivot.
- `child_leaps` uses its own policy names (`child_leaps_select`…), so a blind
  drop on the Group A pattern would leave it behind. Postgres ORs permissive
  policies, so one survivor re-opens the hole while the migration reports success.
- `weight_logs` was **owner-only** — no partner clause at all. The fix widens
  access so partners can see growth data, consistent with every other log table.

### Follow-up — eight more tables with the same `parent_id` pivot

Out of scope for Phase 1.5, same bug:
`child_checklist_items`, `cry_analyses`, `sleep_plans`, `scheduled_visits`,
`speech_practice_plans`, `sleep_day_todos`, `activity_plans`, `child_activities`.

- [ ] Repoint these at `child_id` using the same `can_access_child` /
      `can_write_child` pair once Phase 1.5 has proven itself on live.
- [ ] `can_access_child` lacks the `_user_id = auth.uid()` self-check that
      `has_partner_access` has, and is callable over PostgREST — any authenticated
      user can probe whether an arbitrary uid can reach an arbitrary child id.
      One-line fix, deliberately not bundled into the RLS migration.

---

## Phase 2 — Active-illness surfacing (frontend)

- [ ] `useNextSteps.tsx` emits a `domain: "health"` item, tier `soon`
- [ ] `QuickLogFAB` gains a "Temp" action while an illness is active
- [ ] `TalkThisThroughButton` → pediatrician persona from the illness card
- [ ] After 14 days open: "still going? tap to update" — a prompt, never a write
- [ ] QA pass

No `HOME_SECTIONS` entry — a live-situation affordance must not be hideable behind
a stale preference. Illness ends only by explicit parent action; auto-closing would
corrupt the timeline a doctor reads.

---

## Phase 3 — Observations: the narrative layer

### 3a. Migration (backend)
- [ ] `child_observations` — `said_at` distinct from `created_at`; nullable
      `sleep_log_id` / `feeding_log_id` with `ON DELETE SET NULL`
- [ ] RLS copied verbatim from `caregiver_notes` (`20260502030000`)
- [ ] `REPLICA IDENTITY FULL` + realtime publication
- [ ] Index `(child_id, said_at desc)`
- [ ] **Open decision:** partner account deletion cascades their observations off
      the owner's child record. Defensible as the author's deletion right, silent
      data loss for the owner. Decide, then log in `docs/legal-review-log.md`.
- [ ] `get_advisors` clean after apply

### 3b. Capture (frontend)
- [ ] `ObservationComposer.tsx` — textarea + mic, editable `said_at`.
      Voice reuses `useSpeechRecognition`, **not** `parse-voice-log`. No AI at capture.
- [ ] `useObservations.tsx`, routed through `invalidateAfterLogWrite`
- [ ] `ActiveSessionBanner` mic affordance (stamps the session FK)
- [ ] `QuickLogFAB` "Note" action for the no-session case (the majority)
- [ ] Render inline on the day timeline
- [ ] QA pass

iOS: ActivityKit can't capture voice backgrounded, so the Live Activity deep-links
into the composer. Watch capture is a follow-up.

### 3c. Lazy extraction
- [ ] `useChildContext` — observations join the AI context blob
- [ ] `briefing` — last 24h feed `watch`; quote, never diagnose

---

## Phase 4 — Baseline deviation (frontend, client-only)

- [ ] `src/lib/baseline.ts` — pure, `now` as a parameter
- [ ] `src/lib/__tests__/baseline.test.ts`
- [ ] `useBaseline.tsx`, `TodayCard`, `homeSections`, `Dashboard`
- [ ] QA pass

3 complete days vs. the 14 before them (drift cancels across both windows).
Three metrics; both a 25% relative and an absolute floor must clear; coverage gate
returns `insufficient_data` — **a drop in logging must never render as a drop in
the child's behavior.** Illness days excluded from reference, deviations suppressed
while an illness is active. At most one deviation shown.

Required test fixtures: flat → null; 40% drop → fires; gradual 2%/week over 17 days
→ does **not** fire; logging stopped 2 days → `insufficient_data`; illness overlap
→ suppressed; 3-vs-2 diapers → blocked by the floor.

No new notification types — in-app only for v1.

---

## Phase 5 — Baseline + observations into the briefing (backend)

- [ ] `useBriefing` sends baseline; added to the query key
- [ ] `briefing/index.ts` validates defensively, appends one context line
- [ ] Prompt: exact numbers only; silent when `suppressed_illness` /
      `insufficient_data`
- [ ] QA pass

---

## Phase 6 — Narrative visit summary (backend → QA → frontend)

- [ ] `supabase/functions/visit-summary/index.ts` — **fetches nothing**; consumes a
      client-built facts block so summary and PDF body cannot disagree
- [ ] `useVisitSummary.tsx`, `renderNarrativeSummary`, `PremiumGate` on the section
- [ ] Guardrails: prompt bans · numeric allowlist · banned-phrase scan ·
      deterministic template fallback
- [ ] Fifth rule: parent observations quoted **attributed and verbatim**, never
      absorbed into the model's voice or used to support an inference
- [ ] QA between the backend and frontend delegations

Adversarial test: an observation saying "I think she has an ear infection" — the
model must quote it without adopting it.

---

## Phase 7 — Write tools over MCP only (backend → QA → frontend)

In-app `AIChatWidget` stays read-only. Cut: `log_proposal` SSE frame,
`ChatLogConfirmCard`, AIChatWidget write handling.

- [ ] Migration: `source` gains `'mcp'` (per-table — only feeding/sleep carry
      `'timer'`); add `illness_logs.source`. **No scope migration needed** — the
      column already exists and is threaded through the OAuth flow.
- [ ] `ResolvedToken` carries `scope` — currently `{ user_id, id }`, so nothing is
      enforceable without this
- [ ] `tools/list` scope-aware; `tools/call` rejects writes before JWT minting
- [ ] Registry split + MCP annotations (`readOnlyHint: false`, `idempotentHint`)
- [ ] `idempotency_key` on every write tool — transports retry
- [ ] Write rate limit (reuse the `voice_parse_events` pattern)
- [ ] Consent screen read-only vs. read+write; `ConnectClaudeSettings` downgrade
- [ ] `SubprocessorsPage` + `PrivacyPage` copy (currently says read-only — becomes
      false the day this ships)
- [ ] **`docs/legal-review-log.md` entry is mandatory**
- [ ] Flip `mcpReadCategories.test.ts` into a scope-enforcement guard
- [ ] QA after each delegation

Existing grants keep working untouched — no forced re-authorization.

`log_medication` excluded: dose is the highest-harm field an LLM can get wrong, and
over MCP there is no app-side review at all.

---

## Review

_To be filled in as phases land._
