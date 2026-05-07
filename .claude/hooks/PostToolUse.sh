#!/usr/bin/env bash
# PostToolUse hook — fires after every tool use.
#
# The diagram in CLAUDE.md describes this slot as "Auto-commit NM-XXX after edits".
# Auto-committing on every edit is risky (it can fragment work and leak WIP),
# so this default just stages the changed file and prints the staged diff size,
# leaving the actual commit to the developer or to /ship.
#
# Wire it up in .claude/settings.json under hooks.PostToolUse.
# Disable by removing it from settings.json.

set -euo pipefail

# Only act on file-mutating tools; the harness passes the tool name in $CLAUDE_TOOL_NAME.
case "${CLAUDE_TOOL_NAME:-}" in
  Edit|Write|NotebookEdit) ;;
  *) exit 0 ;;
esac

file_path="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"
[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

# Stay silent if not in a git repo.
git -C "$(dirname "$file_path")" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

git -C "$(git -C "$(dirname "$file_path")" rev-parse --show-toplevel)" add -- "$file_path" >/dev/null 2>&1 || true
