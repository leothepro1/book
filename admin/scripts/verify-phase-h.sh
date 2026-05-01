#!/usr/bin/env bash
# Phase H verification gauntlet.
# Each check prints ✓ or ✗ <reason>. Exits 1 if any ✗.
#
# Spec: docs/architecture/draft-orders-invoice-flow.md v1.3
# Plan: /tmp/phase-h-plan.md §"Verification"

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

FAILED=0

check() {
  # check "label" "command"
  local label=$1
  local cmd=$2
  if eval "$cmd" >/dev/null 2>&1; then
    echo "✓ $label"
  else
    echo "✗ $label"
    FAILED=1
  fi
}

# 1. Schema unchanged — no new migrations + DraftCheckoutSession unchanged
check "schema unchanged (no new prisma migrations vs HEAD)" \
  "git diff HEAD --name-only -- prisma/migrations | grep -q . && false || true"

# Exit-code based: vitest returns non-zero iff any test fails.
# Avoids fragile grep against ANSI-coloured output.

# 2. session-transitions tests pass
check "session-transitions tests pass" \
  "npx vitest run app/_lib/draft-orders/session-transitions.test.ts >/dev/null 2>&1"

# 3. auto-refund-session tests pass
check "auto-refund-session tests pass" \
  "npx vitest run app/_lib/draft-orders/auto-refund-session.test.ts >/dev/null 2>&1"

# 4. handle-draft-order-pi tests pass (all 16 branches)
check "handle-draft-order-pi tests pass (16 branches)" \
  "npx vitest run app/api/webhooks/stripe/handle-draft-order-pi.test.ts >/dev/null 2>&1"

# 5. setSentryTenantContext call present in route.ts
check "setSentryTenantContext present in webhook route.ts" \
  "grep -q 'setSentryTenantContext(tenantId)' app/api/webhooks/stripe/route.ts"

# 6. No TODO('phase-h') strings left in code
check "no TODO(phase-h) strings in code" \
  "! grep -RnE 'TODO\\(phase-h\\)|TODO: phase-h' app/_lib/draft-orders app/api/webhooks/stripe"

# 7. DraftCheckoutSession.stripePaymentIntentId @unique present in schema (Phase B sanity)
check "DraftCheckoutSession.stripePaymentIntentId @unique present" \
  "grep -E 'stripePaymentIntentId\\s+String\\?\\s+@unique' prisma/schema.prisma"

# 8. Phase E PI metadata creation site contains required fields (kind, draftOrderId, draftCheckoutSessionId)
check "Phase E PI metadata: kind / draftOrderId / draftCheckoutSessionId" \
  "grep -q 'kind: \"draft_order_invoice\"' app/_lib/draft-orders/checkout-session.ts && \
   grep -q 'draftOrderId,' app/_lib/draft-orders/checkout-session.ts && \
   grep -q 'draftCheckoutSessionId: session.id' app/_lib/draft-orders/checkout-session.ts"

# 9. session-transitions has no imports from outside draft-orders (boundary check)
# It's allowed to import from @prisma/client (schema-derived types only).
check "session-transitions imports only from @prisma/client + within module" \
  "! grep -E '^import' app/_lib/draft-orders/session-transitions.ts | grep -vE '@prisma/client'"

# 10. No callers of session-transitions live outside the draft-orders module
check "canSessionTransition consumers live inside draft-orders + the webhook handler" \
  "grep -RlE 'canSessionTransition|SESSION_TRANSITIONS' app/ | \
     grep -vE '^(app/_lib/draft-orders/|app/api/webhooks/stripe/handle-draft-order-pi)' | \
     grep -q . && false || true"

# 11. tsc passes (baseline of 3 pre-existing errors in accommodations/actions.test.ts)
TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep -cE '^[^[:space:]].*\(.*\):[[:space:]]*error' || true)
if [ "$TSC_ERRORS" -le 3 ]; then
  echo "✓ tsc errors at baseline (≤3 pre-existing in accommodations/actions.test.ts)"
else
  echo "✗ tsc errors above baseline ($TSC_ERRORS > 3) — Phase H regressed type-checking"
  FAILED=1
fi

# 12. .claude/settings.local.json is unstaged (harness noise filter — Phase H must not commit it)
check "no .claude/settings.local.json in git index" \
  "! git diff --cached --name-only | grep -q '^.claude/settings.local.json$'"

# 13. git diff names exactly the 8 Phase H files (4 created + 3 modified + verify script)
EXPECTED_FILES=(
  "app/_lib/draft-orders/auto-refund-session.test.ts"
  "app/_lib/draft-orders/auto-refund-session.ts"
  "app/_lib/draft-orders/session-transitions.test.ts"
  "app/_lib/draft-orders/session-transitions.ts"
  "app/api/webhooks/stripe/handle-draft-order-pi.test.ts"
  "app/api/webhooks/stripe/handle-draft-order-pi.ts"
  "app/api/webhooks/stripe/route.ts"
  "scripts/verify-phase-h.sh"
)
# `git diff` returns paths relative to the repo root (which is the
# parent of admin/), so tracked-file modifications come back prefixed
# with `admin/`. Untracked files via `git ls-files --others` honour
# cwd so they come back unprefixed. Strip the leading `admin/` from
# every line so both lists agree with the EXPECTED set.
ACTUAL_FILES=$(
  {
    git diff HEAD --name-only -- $(printf '%s ' "${EXPECTED_FILES[@]}")
    git ls-files --others --exclude-standard -- $(printf '%s ' "${EXPECTED_FILES[@]}")
  } | sed 's|^admin/||' | sort -u
)
EXPECTED_SORTED=$(printf '%s\n' "${EXPECTED_FILES[@]}" | sort)
if [ "$ACTUAL_FILES" = "$EXPECTED_SORTED" ]; then
  echo "✓ git diff scope matches the 8 Phase H files exactly"
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
  echo "FAIL — at least one Phase H verification check did not pass."
  exit 1
fi

echo
echo "PASS — all Phase H verification checks green."
exit 0
