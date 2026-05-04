#!/bin/bash
#
# PostToolUse hook — run ESLint on edited TS/TSX files.
#
# Provides immediate feedback so Claude can fix lint errors before
# moving on. Exit 2 sends ESLint output back to Claude as feedback
# (the edit itself already completed — exit 2 here means
# "the action happened, but here's what's wrong, fix it next").
#
# Resilience:
#   - Bails silently if jq is missing (can't parse stdin)
#   - Bails silently if eslint isn't installed (fresh clone, CI box)
#   - Bails silently for non-TS/TSX files
#   - Bails silently for files outside admin/
#   - Distinguishes ESLint config errors (exit 2) from lint errors (exit 1)
#     and only blocks Claude on real lint errors — config breakage is
#     surfaced as a non-blocking warning so it doesn't gate every edit.
#
# Performance:
#   - Uses --cache so subsequent runs hit the cache and complete in <500ms.
#     Cache lives in .next/cache/eslint/ so it's nuked with the standard
#     dev-server reset.
#
# Disable with CLAUDE_HOOK_ESLINT=0
#
set -u

[[ "${CLAUDE_HOOK_ESLINT:-1}" == "0" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# Extract the edited file path from the JSON Claude Code pipes in.
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[[ -z "$file" ]] && exit 0

# Only TypeScript / TSX files.
[[ "$file" =~ \.(ts|tsx)$ ]] || exit 0

# Skip generated / vendored paths.
case "$file" in
  */node_modules/*|*/.next/*|*/dist/*|*/build/*|*/coverage/*|*/_audit/*)
    exit 0 ;;
esac

# Locate the admin/ root (the file lives somewhere under it).
case "$file" in
  */admin/*) root="${file%/admin/*}/admin" ;;
  *) exit 0 ;;
esac

# Skip silently if eslint isn't installed (fresh clone — npm install pending).
[[ -x "$root/node_modules/.bin/eslint" ]] || exit 0

cd "$root" || exit 0

# Cache eslint results so per-edit runs stay sub-second.
mkdir -p .next/cache 2>/dev/null || true
cache_loc=".next/cache/eslint-claude-hook"

output=$(
  ./node_modules/.bin/eslint \
    --quiet \
    --no-warn-ignored \
    --cache --cache-location "$cache_loc" \
    "$file" 2>&1
)
status=$?

# eslint exit codes:
#   0 — no problems
#   1 — lint errors found  → block, send output back to Claude
#   2 — config / fatal error → don't block (would gate every edit on broken config)
case "$status" in
  0) exit 0 ;;
  1)
    if [[ -n "$output" ]]; then
      printf 'ESLint errors after editing %s:\n\n%s\n' "$file" "$output" >&2
      exit 2
    fi
    exit 0
    ;;
  *)
    # Config error or unknown failure — surface to user, do not block Claude.
    if [[ -n "$output" ]]; then
      printf '[eslint hook] non-lint failure (exit %s) for %s:\n%s\n' \
        "$status" "$file" "$output" >&2
    fi
    exit 0
    ;;
esac
