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

The following items have first-pass implementations but **must be reviewed and approved by legal counsel before public launch**:

- **Privacy Policy** (`src/pages/PrivacyPage.tsx`) — especially the COPPA section, AI data processor relationship, data retention periods, and right-to-deletion language. Both pages carry a "Draft — pending legal review" badge until cleared.
- **Terms of Service** (`src/pages/TermsPage.tsx`) — liability limitations, "not medical advice" language, acceptable use, governing law/jurisdiction.
- **FAQ support email** (`src/pages/FAQPage.tsx`) — confirm the correct contact address before launch.
- **COPPA verifiable parental consent** — the current checkbox on signup may not meet the FTC's "verifiable parental consent" standard for apps collecting data on under-13s. Legal should assess whether a stronger mechanism (e.g. email confirmation loop, credit card verification) is required.
- **Data Processing Agreement with AI provider** — confirm a DPA is in place since child health data (name, age, health notes, milestones) is sent to the AI service for processing.
- **`delete_user_account()` RPC** (`supabase/migrations/20260416000000_compliance_security.sql`) — the SECURITY DEFINER function deletes from `auth.users`; verify with Supabase support that this approach is supported in your deployment tier and test thoroughly in staging before enabling in production.

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
