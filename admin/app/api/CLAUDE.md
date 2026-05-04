# API routes — index

This file lists all platform-level API routes. Domain-specific API routes
(translations, discounts, PMS reliability, checkout) are documented in
their respective `_lib/{domain}/CLAUDE.md`.

---

## Platform routes

- `/api/media` — CRUD + thumbnails + stats + cleanup
- `/api/tenant/draft-config` — save unpublished config
- `/api/tenant/preview-stream` — live preview SSE
- `/api/webhooks/clerk` — org/user sync (Svix verification)
- `/api/webhooks/resend` — email delivery status (Svix verification)
- `/api/email-templates` — template CRUD + preview + test send
- `/api/admin/backfill-portal-slugs` — one-time slug backfill (CRON_SECRET)
- `/api/admin/backfill-email-from` — one-time emailFrom backfill (CRON_SECRET)

---

## Cron jobs (vercel.json)

- `/api/cron/expire-reservations` — every 5 min
  Releases expired inventory reservations, booking locks, webhook events (>30d)
- `/api/cron/reconcile-stripe` — every 15 min
  Heals stuck PENDING orders by checking Stripe status
- `/api/cron/retry-emails` — every 5 min
  Drains EmailSendLog FAILED rows via exponential backoff
- `/api/cron/retry-pms-webhooks` — every 5 min
  Drains PmsWebhookInbox PENDING/FAILED rows
- `/api/cron/reconcile-pms?tier={hot|warm|cold}` — multi-tier
  Hot: every 2 min, warm: hourly, cold: nightly 03:23
- `/api/cron/retry-pms-outbound` — drains PmsOutboundJob retry ladder
- `/api/cron/release-expired-holds` — every 5 min
  Releases PMS Optional reservations that timed out
- `/api/cron/cleanup-pms-reliability` — drops old idempotency rows
- `/api/cron/shadow-audit-pms` — nightly 02:30
  Verifies PAID Bookings against PMS state

All crons require `Authorization: Bearer ${CRON_SECRET}` header.

---

## Conventions

- All routes must call `resolveTenantFromHost()` if tenant-scoped
- All write routes must call `checkRateLimit()` from `_lib/rate-limit/checkout.ts`
- All external HTTP calls inside route handlers use `resilientFetch()`
- All errors flow through Sentry — `setSentryTenantContext()` runs first
- Webhook routes: capture raw body BEFORE JSON parse (signature covers exact bytes)
- Cron routes: orchestrators only — never embed business logic, call into `_lib/`

For domain-specific route patterns see:
- `app/_lib/orders/CLAUDE.md` — checkout, payment-intent, Stripe webhook
- `app/_lib/integrations/reliability/CLAUDE.md` — PMS webhook + reconcile
- `app/_lib/translations/CLAUDE.md` — i18n routes
- `app/_lib/discounts/CLAUDE.md` — admin CRUD + checkout integration
