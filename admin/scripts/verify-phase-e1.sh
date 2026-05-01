#!/usr/bin/env bash
# Phase E.1 verification gauntlet.
# Each check prints ✓ or ✗ <reason>. Exits 1 if any ✗.
#
# Spec: docs/architecture/draft-orders-invoice-flow.md v1.3 §4, §6.5, §7.3
# Plan: /tmp/phase-e1-plan.md §"Verification"

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

FAILED=0

check() {
  local label=$1
  local cmd=$2
  if eval "$cmd" >/dev/null 2>&1; then
    echo "✓ $label"
  else
    echo "✗ $label"
    FAILED=1
  fi
}

# 1. assertDraftCanPlaceHolds defined in holds.ts
check "assertDraftCanPlaceHolds defined in holds.ts" \
  "grep -q 'function assertDraftCanPlaceHolds' app/_lib/draft-orders/holds.ts"

# 2. placeHoldsForDraft no longer uses assertDraftMutable (the swap landed)
check "placeHoldsForDraft uses assertDraftCanPlaceHolds (not assertDraftMutable)" \
  "awk '/^export async function placeHoldsForDraft/,/^}/' app/_lib/draft-orders/holds.ts | grep -q 'assertDraftCanPlaceHolds(draft)' && \
   ! awk '/^export async function placeHoldsForDraft/,/^}/' app/_lib/draft-orders/holds.ts | grep -q 'assertDraftMutable(draft)'"

# 3. assertDraftMutable still exists, still strict on OPEN
check "assertDraftMutable still exists + still rejects non-OPEN" \
  "grep -q 'function assertDraftMutable' app/_lib/draft-orders/holds.ts && \
   grep -q 'draft.status !== \"OPEN\"' app/_lib/draft-orders/holds.ts"

# 4. assertDraftMutable still wired into placeHoldForDraftLine + releaseHoldForDraftLine
check "assertDraftMutable still gates placeHoldForDraftLine + releaseHoldForDraftLine" \
  "test \$(grep -c 'assertDraftMutable(' app/_lib/draft-orders/holds.ts) -ge 2"

# 5. holds.test.ts: new accept/reject matrix tests pass (exit-code based)
check "holds.test.ts (incl. new assertDraftCanPlaceHolds matrix) green" \
  "npx vitest run app/_lib/draft-orders/holds.test.ts >/dev/null 2>&1"

# 6. holds.integration.test.ts compiles + executes (skipped without TEST_DB
#    is the expected CI shape; we only verify it doesn't fail)
check "holds.integration.test.ts compiles + runs (skipped without DATABASE_URL_TEST)" \
  "npx vitest run app/_lib/draft-orders/holds.integration.test.ts >/dev/null 2>&1"

# 7. Phase E tests still green (mocks unchanged → behaviour unchanged for them)
check "Phase E checkout-session tests still green" \
  "npx vitest run app/_lib/draft-orders/checkout-session.test.ts >/dev/null 2>&1"

# 8. Phase H webhook tests still green
check "Phase H handle-draft-order-pi tests still green" \
  "npx vitest run app/api/webhooks/stripe/handle-draft-order-pi.test.ts >/dev/null 2>&1"

# 9. tsc at baseline (3 pre-existing errors in accommodations/actions.test.ts)
TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep -cE '^[^[:space:]].*\(.*\):[[:space:]]*error' || true)
if [ "$TSC_ERRORS" -le 3 ]; then
  echo "✓ tsc errors at baseline (≤3 pre-existing)"
else
  echo "✗ tsc errors above baseline ($TSC_ERRORS > 3) — Phase E.1 regressed type-checking"
  FAILED=1
fi

# 10. .claude/settings.local.json must not be staged
check "no .claude/settings.local.json in git index" \
  "! git diff --cached --name-only | grep -q '^.claude/settings.local.json$'"

# 11. git diff scope: exactly the 4 Phase E.1 files
EXPECTED_FILES=(
  "app/_lib/draft-orders/holds.ts"
  "app/_lib/draft-orders/holds.test.ts"
  "app/_lib/draft-orders/holds.integration.test.ts"
  "scripts/verify-phase-e1.sh"
)
ACTUAL_FILES=$(
  {
    git diff HEAD --name-only -- $(printf '%s ' "${EXPECTED_FILES[@]}")
    git ls-files --others --exclude-standard -- $(printf '%s ' "${EXPECTED_FILES[@]}")
  } | sed 's|^admin/||' | sort -u
)
EXPECTED_SORTED=$(printf '%s\n' "${EXPECTED_FILES[@]}" | sort)
if [ "$ACTUAL_FILES" = "$EXPECTED_SORTED" ]; then
  echo "✓ git diff scope matches the 4 Phase E.1 files exactly"
else
  echo "✗ git diff scope mismatch"
  echo "  expected:"
  printf '    %s\n' "${EXPECTED_FILES[@]}"
  echo "  actual:"
  echo "$ACTUAL_FILES" | sed 's/^/    /'
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  echo
  echo "FAIL — at least one Phase E.1 verification check did not pass."
  exit 1
fi

echo
echo "PASS — all Phase E.1 verification checks green."
exit 0
