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
- AI chat uses SSE streaming — never use `supabase.functions.invoke` for streaming calls; use `fetch` with a `ReadableStream` reader
- Onboarding is a deterministic 5-step wizard (`src/components/OnboardingWizard.tsx`) — no AI, no LLM calls. It creates the child row and writes `primary_interest` + `has_partner` + `onboarding_completed_at` to the `profiles` table on completion. Partner invites are generated via `partner_invitations` insert using the same pattern as `PartnerManagement.tsx`.
- There is no `onboarding` AI skill. The `:::CREATE_CHILD:::` marker pattern has been removed. Do not reintroduce it.

---

## Legal Review Required

A clause-by-clause legal pre-review (May 2026) has been completed by the in-house `legal` agent and the resulting redlines have been applied to `PrivacyPage.tsx`, `TermsPage.tsx`, and `FAQPage.tsx`. Both legal pages still carry a "Draft — pending legal review" badge — keep it until outside counsel signs off.

**Locked decisions (May 2026):**
- Legal entity: **Grace Flare LLC**, Delaware. Postal address still `[REGISTERED AGENT ADDRESS — TBD]` placeholder in `PrivacyPage.tsx` § 1 and `TermsPage.tsx` § 14 — fill before launch.
- COPPA Verifiable Parental Consent method: **email-plus** (confirm-link + 24h second-confirmation email). Currently described in `PrivacyPage.tsx` § 6 but **NOT YET IMPLEMENTED** in code.
- AI provider: **Anthropic**, 30-day abuse-monitoring window, no training. DPA must be on file before launch.
- Liability cap: greater of $100 or fees paid in last 12 months (`TermsPage.tsx` § 9).
- Governing law: Delaware (`TermsPage.tsx` § 12). Venue: New Castle County, DE.
- Dispute resolution: AAA consumer arbitration with class-action waiver and 30-day opt-out (`TermsPage.tsx` § 11). Informal-resolution + opt-out emails go to `legal@graceflare.com`.
- EU/UK: **geo-block** at signup for v1; no Art. 27 representative appointed.
- Inactive-account auto-purge: 24 months (`PrivacyPage.tsx` § 8).
- Backup retention: 30 days (`PrivacyPage.tsx` § 8). Verify Supabase project tier matches.

**Pending counsel sign-off before public launch:**
- Outside counsel review of `PrivacyPage.tsx` and `TermsPage.tsx` end-to-end.
- Confirm AAA arbitration + class-action-waiver enforceability in every state where users sign up.
- Confirm the 30-day backup window matches the actual Supabase project rotation.

**Implementation gaps (FTC Section 5 exposure — copy promises something the code does NOT yet deliver):**
- **VPC email-plus flow** — `PrivacyPage.tsx` § 6 promises email-plus before any child-data write. Currently signup is a single checkbox + `data_consent_given_at` timestamp. Build: `vpc_method`, `vpc_first_confirmation_at`, `vpc_second_confirmation_at`, `vpc_completed_at` columns on `profiles`; `supabase/functions/send-vpc-email/` edge function; RLS on `children` blocking insert until `vpc_completed_at IS NOT NULL`.
- **Direct-notice modal at Add Child** — required by 16 CFR § 312.4(c). Extend `AddChildDialog.tsx` per "Reuse Before You Build". Record `coppa_direct_notice_acknowledged_at`.
- **Partner-invitee consent moment** — invited co-parent needs their own consent confirmation. Add to the existing `partner_invitations` flow.
- **Subprocessor list page** — `PrivacyPage.tsx` § 5 and `FAQPage.tsx` link to `/subprocessors` but the route does not yet exist. Create `src/pages/SubprocessorsPage.tsx` and add it to the router.
- **Rights-request inbox + 30-day SLA** — `PrivacyPage.tsx` § 7 promises a 30-day response. Build admin view for `privacy@` and `coppa@` requests with a verification step.
- **Inactive-account auto-purge cron** — `PrivacyPage.tsx` § 8 promises 24-month inactive purge with a 30-day warning email. Build a scheduled edge function (pg_cron) that triggers `delete_user_account()`.
- **`delete_user_account()` audit** (`supabase/migrations/20260416000000_compliance_security.sql`) — verify the RPC actually purges Storage objects, not just DB rows. Add an end-to-end test asserting deletion. Confirm SECURITY DEFINER `auth.users` deletion is supported on the project's Supabase tier.
- **Geo-block EEA/UK at signup** — required by the EU/UK decision above. Implement via Cloudflare or Supabase edge middleware on the `Auth.tsx` route.
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
