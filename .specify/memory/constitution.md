# Grace Flare Constitution

Grace Flare helps tired parents track and understand their baby's first years. This document holds
the few rules every spec, plan and change is checked against. Each principle comes from something
that went wrong, or was cut, in the app's history. The evidence is cited so the rule can be argued
with, not just obeyed. Operational detail (tokens, file paths, agent routing, legal specifics)
lives in `CLAUDE.md`; this document states the principles behind it.

## Core Principles

### I. Calm, Not Clinical

Everything a parent reads — hardcoded copy, notifications, empty states, and AI output — MUST be
calm, non-judgmental and non-diagnostic.

- No guilt or pressure to log: no streaks, no "you haven't logged", no nagging reminders.
- No diagnosis: a missing log is never a health finding; milestone copy celebrates ("may start…"),
  it never warns ("watch for delays").
- Rules written into an AI prompt MUST also be applied to our own static copy and to fallbacks.
  Writing a rule for the model is not the same as applying it.

*Why:* This is the most repeated correction in the app's history. The streak system was removed
because it pressured parents (2026-07-15). Notification copy was rewritten to remove logging guilt.
Next steps reported a logging gap as a physiological finding (#233), and ~12 lesson entries cover
diagnostic or directive copy.

### II. Child Data Changes Are Legal Changes

Any change that adds, removes, or changes what child data we collect, where it goes, or which AI
flow touches it MUST ship its disclosure updates (Privacy, `/subprocessors`, FAQ, consent copy)
and a `docs/legal-review-log.md` entry **in the same PR**.

- A new data category is a COPPA surface until the legal review says otherwise.
- A retired feature is retired only when its edge function is **undeployed** and its disclosure is
  updated. Deleting the code from the repo is not enough.

*Why:* `detect-milestone`, `parse-voice-log` and `next-step-peek` each remained ACTIVE in
production after their code was deleted. COPPA consent and our FTC paper trail depend on
disclosures matching reality on the day a change ships.

### III. Subtract Before You Add

A new feature, screen, or section MUST state in its spec which parent problem it solves and what
it replaces or simplifies. The default answer to "should we add this?" is no.

- AI stays one-shot (briefings, insights, plans). No chat thread, message composer or free-text
  "ask" box without an explicit founder decision.
- Onboarding stays deterministic: no LLM calls.

*Why:* The product has mostly improved by cutting: in-app chat and log-by-voice (2026-08-28),
milestone photos (2026-06-21, "parents won't use them"), the Next steps feed (2026-09-07), a
seven-section Sleep tab cut down (#235), and feed timers removed three separate times.

### IV. Removal Keeps Data and Every Role Whole

Removing a feature MUST NOT delete user data or leave any role (primary parent, partner,
caregiver) without a way to do what they could do before, unless the spec names that gap and the
founder accepts it.

- Prefer leaving the schema in place over destructive migrations.
- The spec for a removal lists each role's path through the affected flow, before and after.

*Why:* Removing the quick-log button left caregivers with one way to log; removing voice logging
then left them with none (#195 → #205).

### V. One Source of Truth per Fact

Each fact shown to parents (next nap, longest night, corrected age, sleep targets) MUST be computed
by exactly one engine, anchored to one clock, and cached under one query-key root. A second
place showing the same fact MUST reuse the first engine, not reimplement it.

*Why:* The same screen once showed two different "next nap" times and two answers to "longest
night". Query-key and invalidation mismatches recurred ~10 times, including after being written
into the lessons file. Clock, night-boundary and DST bugs are the single largest lesson category
(~14). #238 existed to make sleep guidance and corrected age agree across the app.

### VI. No Silent Failures

Every write MUST check its result and tell the parent what happened and what to do next.

- Check the Supabase `{ error }` return; it does not throw.
- An update or delete that RLS blocks returns 0 rows with no error: treat 0 rows as failure.
- No empty `catch`, no fire-and-forget mutation without `onError`.

*Why:* The account-deletion RPC failed silently in production (#35, 2026-05-09). About 10 lesson
entries cover missing `onError`, empty catches and 0-row RLS results.

### VII. Access Is Enforced in the Database

Who can see or change a child's data MUST be enforced by RLS keyed on `child_id` and partner
access, never by client-sent columns or by hiding UI. Every new table holding child data ships
with RLS in the same migration. UI role-gating is a courtesy, not a control.

*Why:* The partner-access pivot missed `speech_journal`, and backend lessons record repeated gaps
between UI gating and database policy.

### VIII. Prove It by Running It

A change is done when it has been run, not when it reads correctly.

- Root causes are shown by reproducing them, not inferred from reading code.
- Claims like "N of M tests fail" or "this was already broken" are made only against a named,
  freshly-checked-out baseline (never `git stash`).
- A migration in the repo is not a migration in production: confirm it is applied.

*Why:* Recurring lessons record guessed root causes, unverified baselines, and schema that existed
locally but not live.

## Product & Platform Constraints

- **Audience:** tired parents, one-handed, on a phone. iOS (Capacitor) is the primary shell; design
  for it first.
- **Brand:** Grace Flare / Flare+. Colors, type, radius and touch targets come only from the
  tokens in `src/index.css` and the Brand Guidelines in `CLAUDE.md`. No hardcoded hex values.
- **Stack:** React 18 + TypeScript + Vite, Supabase (Postgres, Auth, Storage, Edge Functions),
  React Query for server state, shadcn/ui + Tailwind. A new dependency or service needs a stated
  reason in the plan; a new data processor also triggers Principle II.
- **AI provider:** Anthropic, one-shot calls only, under the executed DPA. AI output is guidance for
  parents, never medical advice.
- **Region:** U.S. only for v1; EU/UK signup is geo-blocked.

## Development Workflow & Quality Gates

- **When to use Spec Kit:** new features, new screens, multi-step flows, and removals follow
  specify → plan → tasks → implement. Bug fixes, copy tweaks and refactors skip it.
- **Constitution Check:** every `plan.md` lists each principle above as pass, fail, or not
  applicable. A fail needs a written justification and founder approval before tasks are generated.
- **Local gate before every PR** (CI does not run these yet):
  1. `npx tsc --noEmit` passes (the Vite build does not type-check).
  2. `npm test` passes.
  3. `npm run lint` adds no problems above the recorded baseline.
- **Review:** the `qa` agent reviews every non-trivial change before commit. Corrections go into
  the relevant `tasks/lessons-*.md` file.
- **Ownership:** routing to the `frontend` / `backend` / `qa` agents follows `CLAUDE.md`.

## Governance

- The founder approves every amendment. Amendments land by PR that states the version bump and
  the history or evidence behind the change.
- Versioning: MAJOR removes or redefines a principle; MINOR adds a principle or materially expands
  one; PATCH clarifies wording.
- This constitution states principles; `CLAUDE.md` holds the operational detail. They MUST agree.
  If they conflict, stop, raise it with the founder, and fix one of them in the same PR.
- Review the constitution whenever a feature is killed or a lesson recurs a third time. Both are
  signs a principle is missing or not being applied.

**Version**: 1.0.0 | **Ratified**: 2026-09-29 | **Last Amended**: 2026-09-29
