# Child Context v1 — todo

Plan: /root/.claude/plans/let-me-know-if-wild-avalanche.md (approved 2026-07-05)
Branch: claude/child-context-milestones-c6ynw2
(Kept separate from tasks/todo.md, which is the App Store launch checklist.)

- [x] P1 Backend: migration 20260805000000 (children.interests + temperament + get_child_profile), _shared/childContext.ts, adopt in briefing / next-step-peek / weekly-insights / chat (add-only) / visit-prep-questions, extract-memory dedupe block, childDataTools description
- [x] P1 Apply migration to live via Supabase MCP + verify columns with list_tables + regen types.ts
- [x] QA gate on P1 (Fix-required → fixes applied + legal log entry)
- [x] P2 Frontend capture: AddChildDialog chips (interests + temperament), OnboardingWizard new step 4 (TOTAL_STEPS=5, renumber post-steps 5→6, 6→7), welcome-screen line
- [x] QA gate on P2 (Pass; edit-mode wipe fix applied)
- [x] P4 Feed: affinity tie-break in rankNextSteps, milestone-gap drill, interest→category map (verified live seed slugs), interest-flavored seedPrompts, memory-aware nudge (committed f6f977f)
- [x] P3 Hub: /dashboard/child-context ChildContextPage, useChildMemories hook, milestoneProgress.ts extraction, MorePage + ProfilePage entry points (committed c1499dc)
- [x] P5 Messaging + legal: MilestonesPage sub-line, NextStepFeed affinity meta, PrivacyPage §2 + §4, CoppaDirectNotice, docs/legal-review-log.md entries, Last reviewed → 2026-07-05
- [x] Consolidated QA gate on P3+P4+P5 (Pass; feed-key invalidation fix applied)
- [x] Build + verify (181/181 tests, build clean), commit, push all phases
- [x] PR #173 open (draft); body updated with phase summary + pending deploy steps

## Review
(fill at end)

## Pending manual/approval-gated
- Deploy 6 edited edge functions (briefing, next-step-peek, weekly-insights, chat, visit-prep-questions, extract-memory) — Supabase MCP deploy/get/list edge-function tools require approval unavailable in this session. Bundles: index.ts + directly-imported _shared modules. Verify per-function verify_jwt config before deploy. Until deployed, live functions simply ignore the new columns (no behavior change).
- get_advisors + generate_typescript_types MCP calls also approval-gated (types hand-edited instead, QA-verified).
