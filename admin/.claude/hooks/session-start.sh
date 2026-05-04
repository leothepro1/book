#!/bin/bash
#
# SessionStart hook — inject project context for Claude.
#
# Stdout from this hook is added to the session context, so Claude knows
# which branch you're on, what's uncommitted, what just landed, and which
# recon docs are active. Keep output terse — every line costs context.
#
# Disable with CLAUDE_HOOK_SESSION_START=0
#
set -u

[[ "${CLAUDE_HOOK_SESSION_START:-1}" == "0" ]] && exit 0

# Resolve repo root from the project dir Claude Code passes in.
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0

# Hop up to the actual repo root if we landed in admin/.
if [[ "$(basename "$root")" == "admin" ]]; then
  cd .. 2>/dev/null || true
fi

# Bail silently if not in a git repo (fresh codespace, CI box, etc.).
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current 2>/dev/null || echo "(detached)")
ahead=$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "")
behind=$(git rev-list --count "HEAD..@{u}" 2>/dev/null || echo "")

echo "## Session start — project context"
echo ""
echo "**Branch:** \`$branch\`"

# Only print upstream delta when meaningful.
parts=""
[[ -n "$ahead"  && "$ahead"  != "0" ]] && parts="$parts $ahead ahead"
[[ -n "$behind" && "$behind" != "0" ]] && parts="$parts $behind behind"
[[ -n "$parts" ]] && echo "**Upstream:**$parts"
echo ""

status=$(git status --short 2>/dev/null)
if [[ -n "$status" ]]; then
  count=$(echo "$status" | wc -l)
  echo "**Working tree: $count file(s) changed**"
  echo '```'
  echo "$status" | head -25
  if [[ "$count" -gt 25 ]]; then
    echo "... ($((count - 25)) more)"
  fi
  echo '```'
else
  echo "**Working tree clean.**"
fi
echo ""

echo "**Recent commits on this branch:**"
echo '```'
git log --oneline -5 2>/dev/null || echo "(no commits)"
echo '```'
echo ""

# Surface active recon docs if the _audit/ workflow is in use.
# Per CLAUDE.md, the operator workflow drafts recon docs in admin/_audit/
# before each phase. Showing the 5 most recent helps Claude continue
# where the last session left off.
if [[ -d admin/_audit ]]; then
  recent=$(ls -1t admin/_audit/*.md 2>/dev/null | head -5)
  if [[ -n "$recent" ]]; then
    echo "**Recent recon docs in \`admin/_audit/\` (newest first):**"
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      mtime=$(date -r "$f" "+%Y-%m-%d" 2>/dev/null || echo "")
      base=$(basename "$f")
      [[ -n "$mtime" ]] && echo "- \`$base\` ($mtime)" || echo "- \`$base\`"
    done <<< "$recent"
    echo ""
  fi
fi
