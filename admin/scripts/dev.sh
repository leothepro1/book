#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# ── Maskininfo ──────────────────────────────────────────────
CPUS=$(nproc 2>/dev/null || echo 4)
MEM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 4096)

# Node.js heap: 75% av tillgängligt RAM, max 8 GB (dev behöver inte mer)
HEAP_MB=$(( MEM_MB * 75 / 100 ))
(( HEAP_MB > 8192 )) && HEAP_MB=8192

echo "▸ Maskin: ${CPUS} kärnor, ${MEM_MB} MB RAM → Node heap ${HEAP_MB} MB"

# ── Rensa gammal state ──────────────────────────────────────
echo "▸ Dödar gamla processer på port 3000-3009..."
for port in 3000 3001 3002 3003 3005 3007 3009; do
  fuser -k "${port}/tcp" 2>/dev/null || true
done
sleep 0.5

echo "▸ Rensar cache..."
rm -rf .next
rm -rf node_modules/.cache
rm -rf /tmp/turbopack-* 2>/dev/null || true

# ── Beroenden ───────────────────────────────────────────────
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "▸ Installerar beroenden..."
  npm install || { echo "✗ npm install misslyckades"; exit 1; }
else
  echo "▸ node_modules uppdaterad — skippar install"
fi

# ── Prisma client (krävs för dev) ──────────────────────────
if [ ! -d node_modules/.prisma/client ] || [ prisma/schema.prisma -nt node_modules/.prisma/client/index.js ]; then
  echo "▸ Genererar Prisma client..."
  npx prisma generate
fi

# ── Miljövariabler ──────────────────────────────────────────
export NODE_ENV=development
export NEXT_TELEMETRY_DISABLED=1

# Node.js prestanda
export NODE_OPTIONS="--max-old-space-size=${HEAP_MB}"

# ── Starta dev-server ──────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo "  Dev-server startar med Turbopack"
echo "  Heap: ${HEAP_MB} MB | Kärnor: ${CPUS}"
echo "════════════════════════════════════════════════════"
echo ""

exec npx next dev --turbopack
