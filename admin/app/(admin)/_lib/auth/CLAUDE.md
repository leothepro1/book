# Clerk integration

## Auth layer

Production: Clerk handles sessions, JWT, cookies. auth() gives userId/orgId/orgRole.
Dev: devAuth.ts returns { userId: "dev_user", orgId: DEV_ORG_ID, orgRole: "org:admin" }.
DEV_OWNER_USER_ID substitutes the real org owner for Clerk API calls in dev.

---

## Role-based access

ADMIN_ROLE constant defined in roles.ts — single source of truth.
requireAdmin() guards all destructive server actions.
RoleContext provides isAdmin to client components.
Settings panel hides admin-only tabs via adminOnly flag on nav items.
Settings button hidden in sidebar for org:member.

---

## Organisation sync

Webhook handler (`/api/webhooks/clerk`) processes org.created/updated/deleted.
Svix signature verification + idempotency via WebhookEvent table.
Double-write strategy: direct DB write for immediate UI + webhook as safety net.

---

## Feature toggles

Account-level toggles stored as direct Tenant columns (not in JSON settings):
  checkinEnabled, checkoutEnabled — Boolean, immediate effect, no draft/publish.

---

## Tenant policies

TenantPolicy model — per-tenant policy documents (booking terms, house rules, etc.).
Unique constraint on [tenantId, policyId] for fast lookup.
Public API: `getPublicPolicy(tenantSlug, policyId)` — no auth required.
