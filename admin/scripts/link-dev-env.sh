#!/usr/bin/env bash
# Link this worktree's admin/.env to the shared canonical dev env.
#
# Why this exists:
#   Each git worktree (book-A, book-C, book-claude, …) gets its own
#   gitignored admin/.env when first created. Over time these copies
#   drift — Clerk keys rotate, DB URLs change, IDs go stale — and a
#   newly created worktree fails on Clerk API 404 or DB auth errors.
#
# How it works:
#   /workspaces/.env.dev.local is the single source of truth for dev
#   credentials (Clerk dev instance, dev DB, etc.). This script makes
#   admin/.env in the current worktree a symlink to it. One file to
#   update; every worktree picks up changes immediately.
#
# Usage:
#   npm run dev:link-env          # from any worktree's admin/ dir
#
# Behaviour:
#   - If .env is already the right symlink: no-op (success)
#   - If .env is a regular file:           moved to .env.pre-symlink-<ts>
#   - If .env is a different symlink:      replaced
#   - If canonical missing:                aborts with instructions
#
# Notes:
#   - The canonical file lives outside any git repo so `git clean -fdx`
#     can never remove it.
#   - To diverge a single worktree (e.g. test against a different DB),
#     replace its symlink with a regular file: `rm .env && cp /workspaces/.env.dev.local .env`
#   - To migrate a long-running worktree (book-A) without disrupting an
#     active dev server, run this script when that server is stopped.

set -euo pipefail

CANONICAL="/workspaces/.env.dev.local"
TARGET=".env"

# Sanity: must be in a worktree's admin/ directory.
if [[ ! -f "package.json" ]] || ! grep -q '"name": "admin"' package.json; then
  echo "error: run this from a worktree's admin/ directory (no admin/package.json found)" >&2
  exit 1
fi

# Sanity: canonical must exist. If not, instruct the user to bootstrap.
if [[ ! -f "$CANONICAL" ]]; then
  echo "error: canonical dev env not found at $CANONICAL" >&2
  echo "" >&2
  echo "Bootstrap once from a working worktree (e.g. book-A) by running:" >&2
  echo "  cp /workspaces/<working-worktree>/admin/.env $CANONICAL" >&2
  echo "  chmod 600 $CANONICAL" >&2
  echo "Then re-run this script." >&2
  exit 1
fi

# Already a symlink to the canonical: nothing to do.
if [[ -L "$TARGET" ]] && [[ "$(readlink "$TARGET")" == "$CANONICAL" ]]; then
  echo "ok: $TARGET already linked to $CANONICAL"
  exit 0
fi

# Existing .env: back it up so nothing is lost.
if [[ -e "$TARGET" ]] || [[ -L "$TARGET" ]]; then
  BACKUP="${TARGET}.pre-symlink-$(date +%Y%m%d-%H%M%S)"
  mv "$TARGET" "$BACKUP"
  echo "backed up existing $TARGET -> $BACKUP"
fi

ln -s "$CANONICAL" "$TARGET"
echo "linked $TARGET -> $CANONICAL"
echo ""
echo "next steps:"
echo "  1. restart dev server (env changes don't hot-reload)"
echo "  2. delete the .env.pre-symlink-* backup once you've verified things work"
