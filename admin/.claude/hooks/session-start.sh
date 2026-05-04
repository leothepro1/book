#!/bin/bash
#
# SessionStart hook — inject git context for Claude.
#
# Stdout from this hook is added to the session context, so Claude knows
# which branch you're on, what's uncommitted, and what just landed.
# Keep output terse — every line costs a piece of context window.
#
# Disable by setting CLAUDE_HOOK_SESSION_START=0
#
set -u

[[ "${CLAUDE_HOOK_SESSION_START:-1}" == "0" ]] && exit 0

# Resolve repo root from the project dir Claude Code passes in.
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0

# If we're in admin/, hop up to the actual repo root for git info.
if [[ "$(basename "$root")" == "admin" ]]; then
  cd .. 2>/dev/null || true
fi

# Bail silently if not in a git repo (e.g. fresh codespace, CI box).
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current 2>/dev/null || echo "(detached)")
ahead=$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "")
behind=$(git rev-list --count "HEAD..@{u}" 2>/dev/null || echo "")

echo "## Session start — git context"
echo ""
echo "Branch: \`$branch\`"
if [[ -n "$ahead" || -n "$behind" ]]; then
  parts=""
  [[ -n "$ahead" && "$ahead" != "0" ]] && parts="$parts $ahead ahead"
  [[ -n "$behind" && "$behind" != "0" ]] && parts="$parts $behind behind"
  [[ -n "$parts" ]] && echo "Upstream:$parts"
fi
echo ""

status=$(git status --short 2>/dev/null)
if [[ -n "$status" ]]; then
  count=$(echo "$status" | wc -l)
  echo "Working tree: **$count file(s) changed**"
  echo ""
  echo '```'
  echo "$status" | head -25
  if [[ "$count" -gt 25 ]]; then
    echo "... ($(($count - 25)) more)"
  fi
  echo '```'
else
  echo "Working tree clean."
fi
echo ""

echo "Recent commits on this branch:"
echo '```'
git log --oneline -5 2>/dev/null || echo "(no commits)"
echo '```'
