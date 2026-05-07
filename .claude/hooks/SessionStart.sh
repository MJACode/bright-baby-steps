#!/usr/bin/env bash
# SessionStart hook — runs once when Claude Code starts a session in this repo.
# Prints a short project-context summary that gets injected into Claude's first turn.
#
# Wire it up in .claude/settings.json under hooks.SessionStart.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
ahead_behind="$(git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo '0	0')"
ahead="$(echo "$ahead_behind" | awk '{print $1}')"
behind="$(echo "$ahead_behind" | awk '{print $2}')"
dirty_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

cat <<EOF
# Grace Flare session context

- Branch: $branch (ahead $ahead, behind $behind)
- Uncommitted files: $dirty_count
- Stack: React 18 + TypeScript + Vite + Supabase + react-query + shadcn/ui

Reminders:
- Reuse before build (see CLAUDE.md → "Reuse Before You Build")
- Onboarding wizard stays deterministic — no AI in OnboardingWizard.tsx
- Streaming uses fetch + ReadableStream, never supabase.functions.invoke
EOF
