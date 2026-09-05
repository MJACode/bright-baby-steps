# Claude Code Guidelines — Grace Flare

## Reuse Before You Build

Before creating a new component, hook, utility, or migration, check whether something already exists that can be extended or reused.

**Checklist before building new:**
- Is there an existing component that handles a similar UI pattern? (e.g., a dialog, a card, a form)
- Is there a hook that already fetches or mutates the relevant data?
- Is there a Supabase storage bucket or table that can be extended with a new column rather than a new table?
- Can an existing prop or config option cover the new use case without a new abstraction?

**When reuse makes sense:**
- The existing code handles 80%+ of the new use case with minor extension (new prop, new column, new state)
- The change is additive and won't break existing consumers
- The abstraction already fits the domain (e.g., `AddChildDialog` getting an edit mode vs. a separate `EditChildDialog`)

**When a new component/file makes sense:**
- The new feature has meaningfully different concerns, layout, or lifecycle from existing components
- Extending the existing code would require significant conditionals that hurt readability
- The new thing will be reused in 2+ places and deserves its own abstraction

**Default rule:** Extend first, extract later. Three similar lines of code is better than a premature abstraction, but a well-placed prop is better than a duplicate component.

---

## Project Stack

- React 18 + TypeScript + Vite
- Supabase (Postgres, Auth, Storage, Edge Functions with SSE streaming)
- @tanstack/react-query for server state
- shadcn/ui + Tailwind CSS
- React Router v6

## Key Conventions

- All server state lives in React Query hooks under `src/hooks/`
- Supabase schema changes go in `supabase/migrations/` with a timestamp prefix
- Preferences that don't need to sync across devices use `localStorage` via `usePreferences`
- Streaming AI calls use SSE — never use `supabase.functions.invoke` for a streaming call; use `fetch` with a `ReadableStream` reader. The only streaming caller left is `SpeechInsightsPanel`.
- There is **no conversational AI in the app.** The in-app chat was removed on 2026-08-28 (`AIChatWidget`, `chatOpener`, `useChatHistory`, `useChatUsage`). AI is one-shot only: briefings, weekly insights, Next Step suggestions, Word & Sound Journal insights, Visit Prep, and the Flare+ plans. Do not add a chat surface, a message thread, or a free-text "ask" box back without an explicit product decision.
- Onboarding is a deterministic 5-step wizard (`src/components/OnboardingWizard.tsx`) — no AI, no LLM calls. It creates the child row and writes `primary_interest` + `has_partner` + `onboarding_completed_at` to the `profiles` table on completion. Partner invites are generated via `partner_invitations` insert using the same pattern as `PartnerManagement.tsx`.
- There is no `onboarding` AI skill. The `:::CREATE_CHILD:::` marker pattern has been removed. Do not reintroduce it.

---

## Brand Guidelines

Full source: `C:\Users\Matth\OneDrive\Documents\Claude\Projects\Speech App\Grace_Flare_Brand_Guidelines.docx` (v1.0, May 2026)

### Identity
- Brand name is **Grace Flare** (never "Baby Tracker" or any other variant). Premium tier is **Flare+**.
- Brand personality: Confident, Warm, Clear, Modern. Never clinical, preachy, or condescending.

### Colors
All colors are defined as CSS HSL variables in `src/index.css` and exposed as Tailwind utilities. **Never hardcode hex values in product code.**
- Primary: `--primary` / Forest Teal `hsl(152 45% 48%)` — CTAs, active states, icon backgrounds
- Accent: `--accent` / Warm Orange `hsl(30 70% 55%)` — highlights, the flare mark, notifications
- Background: `--background` / Warm Cream `hsl(30 40% 98%)`
- Foreground: `--foreground` / Deep Slate `hsl(240 10% 20%)`
- Module colors: `bg-sleep`, `bg-feeding`, `bg-diapers`, `bg-milestones`, `bg-finance` (+ `-bg` tint variants for card fills)
- Semantic: `--success`, `--warning`, `--destructive` — use only for their designated purposes

### Typography
- **Nunito** (`font-sans`) — all body text, UI labels, form inputs
- **Quicksand** (`font-display`) — display moments only: onboarding headings, dialog titles, screen H1/H2, wordmark. Not for body copy or data.
- Heading weight: `font-bold` (700). Body: `font-normal` (400). Labels/captions: `font-semibold` (600).
- Minimum visible text: `text-xs` (12px). Interactive elements minimum: `text-sm` (14px).
- Never center-align body paragraphs longer than two lines. Left-align all data-dense content.

### Shape & Spacing
- Border radius via `--radius: 1rem` — use `rounded-sm/md/lg/xl/2xl` Tailwind tokens, never raw pixel values.
- Touch targets: every interactive element needs `min-h-[48px] min-w-[48px]` (use `.touch-target` utility class).
- Base spacing unit is 4px (Tailwind default). Common: `p-4` (16px internal), `p-6` (24px cards), `gap-8` (32px between sections).

### Voice & Tone
- Lead with the most important info. Parents are tired — be direct.
- Avoid negative framing: "Tap to log a feed" not "You haven't logged yet."
- Use second person (`you`, `your baby`). Use `we` sparingly.
- Milestone copy is celebratory, not diagnostic: "Your baby may start..." not "Watch for delays if..."
- Error messages explain what happened and what to do next — never just a failure state.

---

## Design Pattern Research — Mobbin MCP

Grace Flare is connected to **Mobbin** (claude.ai connector, org-level) — a library of real shipped app UI. Tools: `mcp__Mobbin__search_screens`, `mcp__Mobbin__search_flows`, `mcp__Mobbin__search_sections`. The `frontend` and `ux` agents both have these in their tool allowlists — `ux` to ground a pattern recommendation, `frontend` to build against it.

**Standing rule: any new screen, flow, or interaction pattern starts with Mobbin references, before any JSX is written.** That covers new pages under `src/pages/**`, new multi-step flows (onboarding, invite/accept, consent, paywall, setup wizards), new interaction patterns the codebase doesn't already have (pickers, timelines, scrubbable charts, swipe actions, bottom-sheet composers), and redesigns of a surface the user has said isn't working.

**Skip it** for copy/colour/spacing/token fixes, bug fixes, refactors, and anything an existing component already covers. **Reuse Before You Build outranks Mobbin** — search the codebase first; only reach for Mobbin once nothing internal fits.

**Search discipline.** `platform: "ios"` for the app shell (we ship to iOS via Capacitor; users are one-handed on a phone); `"web"` only for genuinely web-first marketing/legal/settings pages. One screen or one journey per query, described concretely. Keep `limit` low (3–5 flows, 5–10 screens) — every result is an image and images are expensive in context. Read the images, not just the metadata. Cite each referenced screen as a markdown link to its `mobbin_url`.

**If the `frontend` or `ux` agent reports it has no `mcp__Mobbin__*` tools**, the grant hasn't loaded — agent definitions in `.claude/agents/` are read at session start, so a freshly-added tool needs a new session. Don't debug it mid-task: the parent Claude runs the Mobbin searches itself and passes the returned `mobbin_url` references and structural notes into the delegation prompt. Same outcome, no round-trip.

**The hard boundary.** Mobbin decides *what the screen does and how it's arranged*. The Brand Guidelines above decide *how it looks* — always. Never carry a hex, type scale, radius, or component library across from a reference; translate the structure into our tokens, Nunito/Quicksand, `--radius: 1rem`, 48px touch targets, shadcn primitives already in `src/components/ui/**`, and our voice. Where a Mobbin pattern conflicts with an established Grace Flare convention, the convention wins — surface the conflict rather than silently diverging. If the connector is unavailable, say so in one line and proceed on judgement; never block work on it.

---

## Legal Review

**Posture:** in-house-only review accepted by the founder for the May 2026 v1 U.S. launch. No outside counsel. The "Draft — pending legal review" badge was retired on 2026-05-08 in favor of an "Effective: 2026-05-08 · Last reviewed: 2026-05-08" timestamp on PrivacyPage, TermsPage, and SubprocessorsPage. The full review trail (every pass, every redline, every risk level resolved) lives in `docs/legal-review-log.md` — the FTC / state-AG paper trail. **Update that log every time you touch Privacy / Terms / FAQ / consent / retention / deletion / subprocessor / geo-block code.**

Outside counsel will be commissioned before any of: institutional fund-raise, EU/UK launch, pediatrician/EHR integration, or a material breach. See the log for the full risk-posture caveat.

**Locked decisions (May 2026):**
- Legal entity: **Grace Flare LLC**, Delaware. Registered office c/o Northwest Registered Agent, 8 The Green, Suite A, Dover, DE 19901 — wired into `PrivacyPage.tsx` § 1 and `TermsPage.tsx` § 14.
- COPPA Verifiable Parental Consent method: **email-plus**, no dwell. Three steps: signup-confirmation email (#1) → typed-name digital-signature direct-notice modal at Add Child → separately-actionable second confirmation email (#2). Implemented end-to-end across `vpcGate.ts`, `CoppaDirectNotice.tsx`, `send-vpc-email/index.ts` (v3 ACTIVE on live), and migrations `20260507000000_vpc_email_plus.sql` + `20260508010000_vpc_zero_dwell_and_attestation.sql`.
- AI provider: **Anthropic, PBC**. Seven edge functions invoke it: briefing, weekly-insights, next-step-peek, generate-speech-class, visit-prep-questions, generate-activity-plan, and chat. (`chat` no longer backs a chat UI — since 2026-08-28 it serves one-shot Word & Sound Journal insights only; see its file header.) (The `detect-milestone` photo-milestone function was retired 2026-06-21 along with all milestone-photo features; `parse-voice-log` was retired 2026-08-28 along with log-by-voice.) PrivacyPage § 4 + `/subprocessors` reflect this. **DPA still pending** — § 4 currently uses "we have requested a DPA we expect to confirm…" language; will be rewritten with "we have a written DPA" framing the day the executed PDF is in hand.
- Liability cap: greater of $100 or fees paid in last 12 months (`TermsPage.tsx` § 9).
- Governing law: Delaware (`TermsPage.tsx` § 12). Venue: New Castle County, DE.
- Dispute resolution: AAA consumer arbitration with class-action waiver and 30-day opt-out (`TermsPage.tsx` § 11). Informal-resolution + opt-out emails go to `legal@graceflare.com`.
- EU/UK: **geo-block** at signup for v1; no Art. 27 representative appointed. The geo-block calls `api.country.is` — disclosed in PrivacyPage § 11 and listed at `/subprocessors`.
- Inactive-account auto-purge: 24 months (`PrivacyPage.tsx` § 8).
- Backup retention: "no longer than 30 days" (`PrivacyPage.tsx` § 8). Soft language pending verification of actual Supabase project tier.

**P0 follow-ups within 7 days (post badge-flip):**
- ~~**Anthropic DPA execution**~~ ✅ **DONE 2026-05-08.** DPA accepted (template effective Feb 24, 2025). Audit findings logged in `docs/legal-review-log.md` (DPA entry): (a) no-training is implicit via § B.2 + Schedule 1 § B.5 purpose limitation — the explicit "no training" commitment lives in Anthropic's Commercial Terms / Usage Policy and is cited alongside the DPA in Privacy § 4; (b) the DPA does **not** state a 30-day abuse-monitoring cap — Privacy § 4 was softened to "limited period … per Anthropic's Usage Policy" rather than committing to a number we cannot back from contract; (c) SCCs 2021/914 Module Two + Module Three plus UK and Swiss addenda incorporated by reference (Schedule 3); (d) breach notification is **48h**, beating the 72h target. Executed PDF stored outside the repo (1Password / Google Drive).
- **`delete_user_account()` Storage purge end-to-end test in dev.** Confirm `feedback-screenshots/{uid}/*` and `milestone-photos/{uid}/*` actually purge after the RPC. If Storage deletion silently fails on the project's tier, fix the path or soften PrivacyPage § 8 deletion language.
- **Verify Supabase backup retention** matches the "no longer than 30 days" policy line.

**Production deploy status (May 7, 2026):**
- ✅ All 5 May-2026 migrations applied to live via Supabase MCP (versions 20260507151109 through 20260507151347 in `supabase_migrations.schema_migrations`). Local files in `supabase/migrations/20260507000000_*.sql` through `20260507040000_*.sql` are idempotent — `supabase db push` from local is a no-op against the now-applied schema.
- ✅ Edge functions `send-vpc-email` and `inactive-account-purge` deployed (both v1, ACTIVE).
- ✅ `app_supabase_url` and `app_service_role_key` stored in Supabase Vault. Cron jobs `inactive-account-purge-daily` and `reactivate-nudge-3x-daily` rescheduled (migration `20260507050000_cron_jobs_use_vault.sql`) to read from `vault.decrypted_secrets` instead of `current_setting()`. Hosted Supabase projects don't grant ALTER DATABASE to the SQL editor role, which is why the original `current_setting()` approach silently failed; Vault is the supported alternative.
- ✅ `check-notifications-every-3h` cron migrated to the Vault-based service_role pattern (migration `20260508000000_check_notifications_cron_vault.sql`, applied to live). Hardcoded LEGACY anon JWT removed; schedule (`0 */3 * * *`) preserved.

**Remaining manual steps before VPC actually gates production traffic:**
1. **Set edge-function secrets** in Supabase dashboard → Edge Functions → Secrets:
   - `RESEND_API_KEY` — from your Resend account.
   - `VPC_FROM_EMAIL` — e.g. `Grace Flare <noreply@graceflare.com>` (must use a Resend-verified domain).
   - `APP_URL` — deployed frontend origin (e.g. `https://graceflare.com`).
2. **Verify the sending domain on Resend** — DNS records on `graceflare.com` (or whatever sending domain you pick).
3. **In Supabase Auth → Email → enable "Confirm email"** so signup returns no session until the user clicks the first confirmation link. Without this flip, the first VPC confirmation never fires and `vpc_first_confirmation_at` stays null — meaning email #2 will never go out.

After these three steps, the gate works as: signup → confirm email #1 (Supabase) → tap Add Child → typed-name attestation in CoppaDirectNotice modal → `send-vpc-email` fires email #2 immediately → click `/vpc-confirm?token=...` → `vpc_completed_at` stamped → child INSERT unlocked. The 24h dwell that originally lived between #1 and #2 was removed on 2026-05-08 (migration `20260508010000_vpc_zero_dwell_and_attestation.sql`); the typed-name digital signature replaces it as the "plus" step under 16 CFR § 312.5(b)(2)(ii). Existing accounts are grandfathered (`vpc_method = 'grandfathered_v1_checkbox'`) by the original migration.
- A `BEFORE INSERT` trigger on `public.children` enforces the gate at the DB level for the primary parent (`parent_id = auth.uid()`); partner inserts go through the existing `has_partner_access` path.
- **Direct-notice modal at Add Child** — required by 16 CFR § 312.4(c). Implemented in `src/components/CoppaDirectNotice.tsx`, wired into `AddChildDialog.tsx` (shown once per profile before the form) and `OnboardingWizard.tsx` (shown on step 5 before child INSERT). Acknowledgement stamps `profiles.coppa_direct_notice_acknowledged_at`.
- **Partner-invitee consent moment** — implemented in `supabase/migrations/20260507020000_partner_invitee_consent.sql` + `src/pages/AcceptInvite.tsx`. The accept flow now requires the invitee to check a Privacy/Terms consent box and the `accept_partner_invitation` RPC stamps `partner_access.consent_acknowledged_at`. Existing `partner_access` rows are backfilled with `created_at`.
- **Subprocessor list page** — `src/pages/SubprocessorsPage.tsx` is now live at `/subprocessors`, listing Supabase, Anthropic, and Resend. Update the file when subprocessors change and email subscribers 30 days in advance per Privacy § 5.
- **Rights-request inbox + 30-day SLA** — `supabase/migrations/20260507030000_rights_requests.sql` adds the `rights_requests` audit table with public INSERT and per-requester SELECT RLS. `src/pages/RightsRequestPage.tsx` (linked from PrivacyPage § 7) is the public submit form. v1 triage uses the Supabase dashboard; a custom admin UI and automated acknowledgement email are follow-ups.
- **Inactive-account auto-purge cron** — `supabase/migrations/20260507040000_inactive_account_purge.sql` refactors the deletion logic into a private `_purge_user_data(uid)` helper, adds the admin-only `purge_inactive_account(uid)` RPC, and schedules `inactive-account-purge-daily` via pg_cron at 02:30 UTC. Edge function `supabase/functions/inactive-account-purge/` runs the two-stage flow: warn at 24-month inactivity, purge 30 days after warning. **Deploy steps**: deploy the edge function and confirm `app.supabase_url` + `app.service_role_key` are set at the database level (same convention as `reactivate-nudge`).
- **`delete_user_account()` audit** — addressed in `supabase/migrations/20260507010000_audit_delete_user_account.sql`. The RPC now deletes from every parent_id-referencing table (15 records-tables that previously would have caused FK violations on the final profiles delete), then purges Storage objects under `{uid}/` in `feedback-screenshots` and `milestone-photos`, then deletes `profiles` and `auth.users`. **Still pending**: end-to-end test asserting Storage deletion in dev, and confirmation with Supabase support that SECURITY DEFINER `auth.users` deletion is supported on the project's tier. Email-confirmation of completion (Privacy § 8 promise) requires a Resend send-email step from a follow-up edge function — not done yet.
- **Geo-block EEA/UK at signup** — implemented in `src/lib/geoBlock.ts` + `src/hooks/useGeoBlock.ts`, surfaced in `src/pages/Auth.tsx`. Best-effort client-side IP geolocation via api.country.is. Blocks the signup form only; login still works for any pre-existing EEA/UK account so they can export and delete their data. PrivacyPage § 11 documents the position in plain text as a fallback.
- **Anthropic DPA verification** — confirm executed DPA covers (a) no-training, (b) 30-day abuse-monitoring max, (c) SCCs (2021/914), (d) breach notification ≤72h. Store the executed PDF and log the date.

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to tasks/todo.md with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to tasks/todo.md
6. **Capture Lessons**: Update tasks/lessons.md after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs.

---

## PR Auto-Merge Policy

When Claude opens a pull request in this repo, Claude **merges it without waiting for the user to ask** once these conditions all hold:

1. The PR is targeting `main`.
2. The PR was authored by Claude in the current session (not a human contributor's PR, not a stale Claude PR from an old session).
3. CI is green (every check run has `conclusion: success` or is not required).
4. There are no unresolved review comments / threads.
5. The change has no obviously destructive side effects beyond what Claude described in the PR body (no dropped tables, no force-push to other branches, no deleted production data).

Otherwise — failing checks, unresolved review, or destructive-looking diff — Claude pauses and surfaces a one-line summary so the user can decide.

This policy exists because every CodeMagic-config iteration in May 2026 went `push → open PR → wait for "merge" → merge → next build`, which added a human round-trip to every cycle. Auto-merge keeps the build-fix loop tight while preserving the PR audit trail (history, diff, link, review comments) that direct pushes to `main` would skip.

User can override per-PR by saying "don't merge" / "hold off" / similar.

---

## `.claude/` Folder Reference

Canonical layout of every file Claude Code reads. CLAUDE.md is advisory; hooks are deterministic; skills load on demand.

```
your-project/                       Project root for Claude Code
├── CLAUDE.md                       Project rules, < 200 lines
├── CLAUDE.local.md                 Personal overrides, gitignored
├── .gitignore                      Ignores *.local.* and secrets
├── .mcp.json                       MCP servers, MUST be at root
└── .claude/                        Where Claude Code looks first
    ├── hooks/                      Deterministic, fires every time
    │   ├── PostToolUse.sh          Auto-commit NM-XXX after edits
    │   ├── SessionStart.sh         Load project context on startup
    │   └── PreCompact.sh           Save state before compaction
    ├── commands/                   Slash commands (legacy, still works)
    │   └── ship.md                 Build, lint, deploy in one go
    ├── skills/                     Canonical home, model-invokable
    │   ├── carousel/               Auto-factory for IG carousels
    │   └── drill/                  Generates pacing drills
    ├── agents/                     Subagents, isolated context window
    │   ├── code-reviewer.md        Reviews diffs, returns summary
    │   ├── researcher.md           Web fetch and synthesis
    │   └── log-analyzer.md         Parses errors and crash logs
    ├── output-styles/              Custom response formats
    │   └── terse.md                Code-only, no prose
    ├── plugins/                    First-class in 2026, /plugin:command
    │   └── vercel/                 Bundled commands, agents, MCP
    ├── rules/                      Path-scoped, loads on glob match
    │   └── api.md                  Loads only for src/api/**
    ├── statusline                  Bottom-bar display config
    ├── settings.json               Permissions, model, hook registry
    └── settings.local.json         Personal, gitignored
```

---

## Specialist Agents — Frontend / Backend / QA

Three subagents in `.claude/agents/` carry the bulk of the implementation work. Each maintains its own lessons library so corrections persist across sessions.

| Agent | Domain | Lessons file |
|---|---|---|
| `frontend` | UI: `src/components/**`, `src/pages/**`, client-state hooks, Tailwind, brand tokens. Holds the **Mobbin** MCP tools — see "Design Pattern Research" above | `tasks/lessons-frontend.md` |
| `backend` | Supabase: `supabase/migrations/**`, `supabase/functions/**`, RLS, edge functions, cron, Vault. Holds the **Supabase** MCP tools (`mcp__Supabase__*`) | `tasks/lessons-backend.md` |
| `qa` | Read-only QA reviewer. Runs after every non-trivial frontend or backend change. Holds read-only Supabase MCP tools to verify live schema against a diff | `tasks/lessons-qa.md` |

**MCP tool grants are an allowlist.** A subagent only receives the tools named in its `tools:` frontmatter — naming a tool in the agent's prose does nothing. Two rules follow: (1) the server prefix must match the connector's actual name (`mcp__Supabase__*`, `mcp__Mobbin__*`) — a stale prefix silently yields "no such tool"; (2) `.claude/agents/*.md` is read at **session start**, so a newly-granted tool reaches the agent on the next session, not the current one. If an agent reports a tool is missing, check those two things before assuming the connector is down.

**Routing rule.** Before writing code, decide which specialist owns the surface area and invoke that agent. The parent Claude orchestrates — it does not write the code itself on tasks that have a clear specialist. Mixed-surface tasks (e.g. a feature with both a migration and a UI) split into two delegations (backend first to land the schema, then frontend to wire the UI), with QA between the two if the backend change is risky.

**QA-after-every-update rule.** After every non-trivial code update — frontend or backend — the parent Claude invokes the `qa` agent before declaring the task complete or running `git commit`. QA returns Pass / Fix-required / Investigate. On Fix-required, the originating specialist gets a second pass with QA's findings. Trivial changes (typo fix, comment edit, version bump, single-line config tweak) skip QA.

**Lessons-library protocol.** When the user or the parent Claude corrects a specialist:

1. The specialist appends a one-line entry to its lessons file: `- YYYY-MM-DD — <pattern that bit us> — <how to avoid it next time>`.
2. Every specialist reads its lessons file at the start of every task.

This is how the agents get better over time without bloating CLAUDE.md.

