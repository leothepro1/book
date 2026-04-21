# Tenant-isolation audit — email

**Domain agent:** `Audit email tenant-isolation` (2026-04-21)
**Main report:** [../tenant-isolation-2026-04-21.md](../tenant-isolation-2026-04-21.md)

## Models covered

EmailSendLog, EmailTemplate, EmailUnsubscribe, EmailCampaign,
EmailCampaignAnalytics, EmailAutomation, EmailAutomationStep,
EmailAutomationAnalytics, EmailDomain, EmailBounceEvent,
EmailAttribution, EmailMarketingSync, EmailRateLimit, EmailSuppression,
EmailAppInstallation, EmailAppTemplate, CampaignRecipient.

## Summary

**~89 call-sites. 65 SAFE · 16 AMBIGUOUS · 8 initially flagged
UNSAFE (3 confirmed defense-in-depth issues after verification, 5
false positives).**

## Key findings

### 🟠 `api/webhooks/resend/route.ts:90` — updateMany by resendId only

```ts
await prisma.emailSendLog.updateMany({
  where: { resendId },
  data: { status: mappedStatus },
});
```

**Runtime-safe** because `resendId` is globally unique in Resend's
namespace (cannot collide across tenants in our DB). Webhook is
signature-verified before reaching this code.

**Pattern concern:** updateMany without tenantId is a code smell on
webhook paths. **Fix:** resolve log → update by id (M8 in main
report).

Same pattern at `route.ts:150+` for `CampaignRecipient` — also M8.

### 🟡 `_lib/email/rate-limit.ts:97` — deleteMany in cleanup cron

```ts
await prisma.emailRateLimit.deleteMany({
  where: { sentAt: { lt: cutoff } },
});
```

**Intentional cross-tenant.** Rate-limit rows are append-only and
transient; cleanup is a TTL-based purge. No tenant-specific data.

**Fix:** Add design-intent comment (L1 in main report). No code
change.

### ✅ `sendEmailEvent()` as sole entry point

Per CLAUDE.md: "sendEmailEvent() is the ONLY way to send email."
Confirmed via grep — all mail-sending paths flow through this
function. tenantId always present; unsubscribe + rate-limit checks
always run before the send.

### ✅ Compound unique constraints

Consistent use of tenantId-bound compound keys:
- `EmailUnsubscribe(tenantId, email)`
- `EmailSuppression(tenantId, email)`
- `EmailTemplate(tenantId, eventType)`
- `EmailDomain(tenantId, domain)`
- `EmailMarketingSync(tenantId, appId, email)`

No cross-tenant lookup possible via these keys.

### ✅ HMAC unsubscribe tokens

Token HMAC input includes tenantId — tokens are tenant-specific by
design. Public `/unsubscribe` route validates token before any DB
mutation.

### ✅ Bounce handling

`EmailBounceEvent.create` includes explicit tenantId. Bounce count
lookups `{ tenantId, email, bounceType: "SOFT" }` — correctly
scoped. Auto-suppression (>=3 soft bounces) adds tenantId-scoped
row to `EmailSuppression`.

### ✅ Campaign + Automation

`CampaignRecipient` and automation analytics are FK-scoped via
campaign/automation → tenantId chain. `sendCampaign` iterates
recipients per-campaign; no cross-tenant mix.

## Per-model highlights

| Model | SAFE | AMBIGUOUS | Issues |
|---|---|---|---|
| EmailSendLog | 8 | 2 | 1 webhook updateMany (M8) |
| EmailTemplate | 5 | 2 | — |
| EmailUnsubscribe | 3 | 0 | — |
| EmailCampaign | 2 | 2 | — |
| CampaignRecipient | 6 | 1 | 1 webhook findFirst (M8) |
| EmailSuppression | 4 | 0 | — |
| EmailRateLimit | 2 | 0 | 1 cleanup deleteMany (L1) |
| EmailDomain | 6 | 0 | — |
| EmailBounceEvent | 2 | 0 | — |
| EmailMarketingSync | 4 | 0 | — |
| EmailCampaignAnalytics | 6 | 0 | — |
| EmailAppInstallation | 1 | 0 | — |

## Recommended fixes

- **M8**: Refactor Resend webhook updateMany → findFirst + update-by-id
- **L1**: Add design-comment to `rate-limit.ts:97` cleanup

Both are sprint-2 priority in main report.
