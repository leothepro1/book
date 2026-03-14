#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# SETUP — Runs ONCE when the codespace is first created.
#
# Installs dependencies, generates Prisma client, and prepares
# the environment. This is the slow path — only runs on creation.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

echo "┌─────────────────────────────────────────┐"
echo "│  Hospitality Platform — First-time Setup │"
echo "└─────────────────────────────────────────┘"

cd /workspaces/hospitality/admin

# ── Install dependencies ──
echo "→ Installing dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install

# ── Generate Prisma client ──
echo "→ Generating Prisma client..."
npx prisma generate

# ── Verify database connection ──
echo "→ Verifying database connection..."
if npx prisma db execute --stdin <<< "SELECT 1" 2>/dev/null; then
  echo "  ✓ Database connected"
else
  echo "  ⚠ Database not reachable (may be external — will retry at runtime)"
fi

echo ""
echo "✓ Setup complete. Dev server will start automatically."
