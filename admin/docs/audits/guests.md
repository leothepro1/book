# Tenant-isolation audit — guests

**Domain agent:** `Audit guests tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

GuestAccount, GuestAddress, GuestNote, GuestTag, GuestAccountEvent,
GuestSegment, GuestSegmentMembership, MagicLinkToken, GuestOtpCode,
MagicLink, AutomationEnrollment.

## Summary

**~33 call-sites. 28 SAFE · 4 AMBIGUOUS · 1 UNSAFE (cross-reference
with payments domain — same finding).**

## Key findings

### 🔴 `_lib/discounts/engine.ts:92` — `hasCustomerUsedDiscount` lacks tenantId

**H2 in main report.** DiscountUsage findFirst by
`{ discountId, guestEmail }` without tenantId. Runtime-safe because
`discountId` is globally unique and FK-scoped to its tenant, but
defense-in-depth requires adding tenantId. 15-min fix.

### ✅ Magic-link and OTP flows — secure

- `MagicLinkToken.findUnique({ where: { token } })` — token is 32
  random bytes (globally unique, not enumerable)
- `GuestOtpCode.findFirst({ guestAccountId, ... })` — `guestAccountId`
  is passed from verified session context
- Rate limiting on magic-link requests: 3 per 15 min per email+tenant
- Iron-session cookie enforces `session.tenantId` end-to-end for
  guest portal routes

### ✅ Guest account creation

`upsertGuestAccount` uses compound unique `[tenantId, email]`. No
cross-tenant collision possible. `upsertGuestAccountFromOrder` passes
tenantId explicitly from the order context.

### ✅ `GuestAccountEvent` dedup

Uses `@@unique([guestAccountId, orderId, type])` compound key with the
declarative `@@unique` directive (note: the partial-unique
`guest_event_order_idempotency` was dropped during fas B cleanup as
redundant — the full unique provides the same guarantee for
`orderId IS NOT NULL` cases).

### ⚠️ Public `/unsubscribe` page accepts `?tenant=X` from URL

`admin/app/(guest)/email-unsubscribe/page.tsx:65` looks up guest by
`{ tenantId_email: { tenantId: <from URL>, email } }`. By design
public — the HMAC unsubscribe-token is the security gate, not the
tenantId. **Fix:** add a comment documenting the intentional
public-tenant-param design.

### ✅ Guest-segment sync cron

Iterates tenants, per-tenant segment membership operations are
properly scoped. Segment membership uses soft-delete pattern — no
data leakage between tenants.

### ✅ AutomationEnrollment worker

`$queryRaw` with `SELECT ... FOR UPDATE SKIP LOCKED` claims
enrollments cross-tenant (intentional — worker pattern). `RETURNING
tenantId` ensures downstream per-enrollment processing is scoped.

## Recommended fixes

See main report **H2** (DiscountUsage tenantId). Plus a small doc
fix on the `/unsubscribe` page to document the design.

No guest-specific P0/P1 fixes beyond H2.
