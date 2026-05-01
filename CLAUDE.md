# Claude Code Guidelines — Baby Steps

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
