#!/bin/bash
#
# UserPromptSubmit hook — block prompts when the working dir is on a
# protected branch (main, master, production, prod).
#
# Why: per admin/CLAUDE.md "Roles in this workspace" — Web Claude does
# not push to deploy branches; Terminal Claude only pushes once green
# and on a feature branch. This hook is the safety net so a session
# accidentally started on `main` doesn't immediately rewrite production.
#
# Exit 2 blocks the prompt and shows the message to the user. The user
# either switches branches or sets CLAUDE_HOOK_PROTECTED_BRANCH=0 for
# the session if they really meant to act on a protected branch.
#
# Disable with CLAUDE_HOOK_PROTECTED_BRANCH=0
#
set -u

[[ "${CLAUDE_HOOK_PROTECTED_BRANCH:-1}" == "0" ]] && exit 0

# Resolve repo root from CLAUDE_PROJECT_DIR.
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0
[[ "$(basename "$root")" == "admin" ]] && cd .. 2>/dev/null

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current 2>/dev/null || echo "")

case "$branch" in
  main|master|production|prod|release)
    cat <<MSG >&2
⚠️  You are on protected branch '$branch'.

Per admin/CLAUDE.md workflow contract:
  - Web Claude does not push to deploy branches
  - Terminal Claude only pushes once green AND on a feature branch
  - The operator (you) bridges the two

Switch to a feature branch before continuing:
    git checkout -b claude/$(date +%Y%m%d)-<short-name>

If you really meant to act on '$branch' (rare — usually a hotfix you
verified locally), set CLAUDE_HOOK_PROTECTED_BRANCH=0 for this session
to bypass this hook.
MSG
    exit 2
    ;;
esac

exit 0
