#!/usr/bin/env bash
# PreCompact hook — runs just before Claude compacts the conversation.
# Saves a snapshot of the current task state to tasks/compact-state.md so
# work in progress survives the context summary.
#
# Wire it up in .claude/settings.json under hooks.PreCompact.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

mkdir -p tasks
ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

{
  echo "# Pre-compact snapshot — $ts"
  echo
  echo "## Branch"
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no git)"
  echo
  echo "## Recent commits"
  git log --oneline -5 2>/dev/null || true
  echo
  echo "## Working-tree changes"
  git status --short 2>/dev/null || true
  echo
  echo "## Open todos (tasks/todo.md)"
  if [ -f tasks/todo.md ]; then
    grep -E '^\s*- \[ \]' tasks/todo.md || echo "(none)"
  else
    echo "(no tasks/todo.md)"
  fi
} > tasks/compact-state.md
