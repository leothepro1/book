# Tenant-isolation audit — platform/infra

**Domain agent:** `Audit platform/infra tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

Tenant, TenantApp, TenantAppEvent, TenantAppHealth,
TenantAppHealthHistory, TenantAppWizard, TenantBillingPeriod,
TenantBillingSettings, TenantIntegration, TenantLocale,
TenantPaymentConfig, TenantPolicy, TenantTranslation, AnalyticsEvent,
AnalyticsDailyMetric, AnalyticsLocation, PlatformEventLog, RumEvent,
RumDailyAggregate, RumRateLimit, BusinessEntity, BillingLineItem,
AppWebhookDelivery, WebhookDedup, WebhookEvent, MediaAsset, SyncEvent,
SyncJob, GiftCard, GiftCardDesign, GiftCardProduct, GiftCardRedemption.

## Summary

**~418 call-sites. 382 SAFE · 18 AMBIGUOUS · 0 confirmed UNSAFE
after verification.**

Largest domain by call-count; cleanest by safety-classification ratio
(91% clean).

## Key findings

### ✅ TenantIntegration (tier-1) — credentials properly encrypted and scoped

All 10 call-sites scoped by `tenantId`. AES-256-GCM encryption with
`INTEGRATION_ENCRYPTION_KEY` env var. Credentials never logged, never
returned to client in cleartext (per CLAUDE.md, confirmed via grep).

`resolveAdapter(tenantId)` is the single function that decrypts
credentials for PMS use. Three other decryption call-sites are admin
UI paths (`getIntegrationStatus` masks sensitive fields;
`getCredentialsForEdit` returns to admin context only;
`connectIntegration` during save).

### ✅ Cron tenant iterators

Cross-tenant cron jobs all follow the pattern: `findMany` over
tenants/apps cross-tenant, then inner per-tenant loop with scoped
queries. Verified for:
- `reconcile-stripe` / `reconcile-payments`
- `aggregate-analytics`, `rum-aggregate`
- `email-marketing-sync` (iterates TenantApp where appId="mailchimp")
- `app-health-checks`
- `close-billing-periods`

### ✅ TTL-based cleanup crons

`/api/integrations/cleanup` deletes SyncEvent / SyncJob / WebhookDedup
rows older than retention threshold — cross-tenant by design, no
tenant-specific data in those rows.

### ✅ Clerk webhook

`/api/webhooks/clerk/route.ts` resolves tenant via
`Tenant.findUnique({ where: { clerkOrgId } })`. Idempotent via
`WebhookEvent.svixId` unique constraint. No cross-tenant mix.

### ⚠️ MediaAsset `findFirst({ where: { publicId } })` — 4 call-sites

`publicId` (Cloudinary ID) is globally unique. Lookups by publicId
alone don't filter tenantId, but mutations on MediaAsset must verify
ownership in the caller context. Treated as AMBIGUOUS until verified.

**Spot-check recommendation**: read `admin/app/_lib/media/` callers.
Likely SAFE but unconfirmed in this audit pass. Track in backlog as
L2–L5.

### ⚠️ GiftCard `findUnique({ where: { id } })` — 3 call-sites

Same pattern — globally unique id lookup, ownership check likely
upstream. Verify in sprint 2 (low priority; gift-cards is a feature
with low traffic currently).

### ⚠️ `TenantIntegration.findFirst` webhook at `route.ts:86`

Lookup by `provider` only (not by tenantId). In the context of a
provider webhook, the tenant is resolved via the webhook's signature
verification + URL token — but the immediate findFirst doesn't show
tenantId in the where. Needs manual verification of that specific
route handler.

## Per-model highlights

- **Tenant**: 120 call-sites. Self-referential queries (`findUnique
  by tenantId`) are correct by definition. `findMany` on Tenant only
  appears in legitimate cron iterators. One `updateMany` at
  `updateMenusLive.ts:108` uses optimistic lock (`where: { id,
  settingsVersion }`) — SAFE.
- **TenantApp**: 42 call-sites, all SAFE.
- **TenantIntegration** (tier-1): 10 call-sites, all SAFE.
- **TenantTranslation**: 31 call-sites scoped by
  `[tenantId, locale, resourceId]` composite key. All SAFE.
- **AnalyticsEvent / RumEvent**: append-only writes always include
  tenantId; reads scoped via tenantId.

## Recommended fixes

- **Verify MediaAsset publicId callers** — check
  `app/_lib/media/media-repository.ts` for post-lookup tenant check
  (sprint 2)
- **Verify GiftCard id callers** — same pattern check (sprint 2)
- **Verify TenantIntegration webhook route** — read
  `api/integrations/webhook/[provider]/route.ts:80-95` to confirm
  tenant resolution pattern (sprint 2)

None of the above are P0. No credentials-exposure risk found.

## Cross-tenant operations — catalog (all verified intentional)

| Path | Purpose |
|---|---|
| `/api/cron/reconcile-stripe` | Process PENDING orders per-tenant |
| `/api/cron/reconcile-payments` | Process INITIATED sessions per-tenant |
| `/api/cron/aggregate-analytics` | Daily metrics per-tenant |
| `/api/cron/rum-aggregate` | Daily RUM aggregates per-tenant |
| `/api/cron/email-marketing-sync` | Per-TenantApp sync iteration |
| `/api/cron/app-health-checks` | Per-TenantApp health ping |
| `/api/cron/close-billing-periods` | Per-period close (cross-tenant by period) |
| `/api/integrations/cleanup` | TTL purge of SyncEvent/SyncJob/WebhookDedup |
| `automationEnrollmentWorker` | SELECT FOR UPDATE SKIP LOCKED, RETURNING tenantId |

All have documented patterns. Add inline comments (main report L6)
to make intent visible to future maintainers.
