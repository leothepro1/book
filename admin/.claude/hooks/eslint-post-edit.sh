#!/bin/bash
#
# PostToolUse hook — run ESLint on edited TS/TSX files.
#
# Provides immediate feedback so Claude can fix lint errors before
# moving on to the next edit. Exit 2 sends ESLint output back to Claude
# as feedback (the edit itself already completed — exit 2 here means
# "the action happened, but here's what's wrong").
#
# Resilience:
#   - Bails silently if eslint isn't installed (fresh clone, CI, etc.)
#   - Bails silently for non-TS/TSX files
#   - Bails silently for files outside admin/
#
# Disable by setting CLAUDE_HOOK_ESLINT=0
#
set -u

[[ "${CLAUDE_HOOK_ESLINT:-1}" == "0" ]] && exit 0

# Read the JSON Claude Code pipes in via stdin.
input=$(cat)

# Extract the edited file path. MultiEdit only reports a single file_path;
# Edit/Write report file_path directly.
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[[ -z "$file" ]] && exit 0

# Only TypeScript / TSX files.
[[ "$file" =~ \.(ts|tsx)$ ]] || exit 0

# Skip non-source paths.
[[ "$file" == */node_modules/* ]] && exit 0
[[ "$file" == */.next/* ]] && exit 0
[[ "$file" == */dist/* ]] && exit 0

# Locate the admin/ root (the file lives somewhere under it).
case "$file" in
  */admin/*) root="${file%/admin/*}/admin" ;;
  *) exit 0 ;;
esac

# Skip silently if eslint isn't installed (fresh clone — npm install pending).
[[ -x "$root/node_modules/.bin/eslint" ]] || exit 0

cd "$root" || exit 0

# Run eslint on just the edited file. --quiet → only errors, no warnings.
output=$("./node_modules/.bin/eslint" --quiet --no-warn-ignored "$file" 2>&1)
status=$?

if [[ $status -ne 0 && -n "$output" ]]; then
  printf 'ESLint errors after editing %s:\n\n%s\n' "$file" "$output" >&2
  exit 2
fi

exit 0
