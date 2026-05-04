# Email notification system

Shopify-grade transactional email via Resend. Per-tenant sender
identity, template customization, rate limiting, and delivery tracking.

---

## Architecture overview

  sendEmailEvent() is the ONLY entry point for all outgoing email.
  Nothing else in the codebase calls resendClient directly.

  Flow:
    1. Check unsubscribe — skip silently if opted out
    2. Check rate limit — skip silently if exceeded
    3. Create send log (QUEUED)
    4. Resolve template (tenant override → platform default)
    5. Render variables + inject preview text
    6. Send via Resend with List-Unsubscribe headers
    7. Update log (SENT/FAILED)
    8. Record send for rate limiting

---

## Sender identity

Every tenant gets an automatic email address based on their subdomain:
  noreply@{portalSlug}.rutgr.com

  Priority chain for from-address:
    1. Custom emailFrom (tenant verified their own domain)
    2. portalSlug-based: noreply@{slug}.rutgr.com
    3. Fallback: noreply@rutgr.com (no portalSlug — edge case)

  Set atomically on tenant creation (Clerk webhook).
  Displayed read-only in admin settings (Portaladress + E-post).

---

## Event types (6)

  BOOKING_CONFIRMED    — after booking synced with PRE_CHECKIN status
  BOOKING_CANCELLED    — after booking status → CANCELLED
  CHECK_IN_CONFIRMED   — after check-in (sync or booking engine action)
  CHECK_OUT_CONFIRMED  — after check-out (sync or booking engine action)
  MAGIC_LINK           — guest requests portal login link
  SUPPORT_REPLY        — hotel replies to support ticket

  Registry: `app/_lib/email/registry.ts` — single source of truth.

---

## Email triggers (sync lifecycle)

  email-triggers.ts maps sync events → sendEmailEvent() calls.
  Isolated from sync engine — email concerns never leak into sync.

  Dedup: Booking has confirmedEmailSentAt, checkedInEmailSentAt,
  checkedOutEmailSentAt timestamps. Checked before sending.
  No dedup for CANCELLED — can be cancelled, re-confirmed, cancelled again.

  safeSend() wraps every trigger — email failures NEVER abort sync.

---

## Rate limiting

  Per-recipient, per-event-type, rolling time window.
  Append-only EmailRateLimit table — count rows, no update races.

  Limits:
    MAGIC_LINK:          3 per 15 min
    BOOKING_CONFIRMED:   1 per 24h
    BOOKING_CANCELLED:   2 per 24h
    CHECK_IN_CONFIRMED:  1 per 24h
    CHECK_OUT_CONFIRMED: 1 per 24h
    SUPPORT_REPLY:       20 per 24h

  Fail-open: if rate limit check fails (DB error), allow the send.
  Cleanup: daily cron deletes records > 24h.

---

## Template system

  React Email components render default HTML (Swedish).
  Tenants can override subject, preview text, and HTML per event type.
  Variable substitution: {{guestName}}, {{hotelName}}, etc.
  Live preview in admin settings with debounced iframe.

---

## Unsubscribe

  HMAC-SHA256 tokens (deterministic, timing-safe).
  One-click unsubscribe via List-Unsubscribe header.
  Public /unsubscribe page — no auth required.
  Auto-unsubscribe on bounce/complaint via Resend webhook.

---

## Domain verification

  Tenants can optionally verify their own domain (e.g. grandhotel.se)
  to send from a custom address instead of the automatic one.
  Managed via Resend Domains API. DNS records shown in admin UI.

---

## Magic link authentication

  Email-based booking engine login — no passwords.
  Flow: guest enters email → system generates signed token → sends email
  → guest clicks link → token validated → session cookie set → redirect.

  MagicLinkToken model: tenant+email scoped (not booking-scoped).
  Rate limited: 3 per 15 min per email+tenant.
  Token: 32 random bytes, base64url, 24h expiry, single-use.
  Session: iron-session encrypted cookie, 7-day maxAge.

---

## Email retry queue

Email failures are never silently dropped. Every failed send is retried
automatically with exponential backoff via a cron job.

Retry schedule (attempts → delay before next retry):
  1st failure → retry in 5 minutes
  2nd failure → retry in 15 minutes
  3rd failure → retry in 1 hour
  4th failure → retry in 4 hours
  5th failure → retry in 24 hours
  After 5 attempts → status = PERMANENTLY_FAILED, never retried again

Key additions to EmailSendLog model:
  status: EmailSendStatus (QUEUED | SENT | FAILED | PERMANENTLY_FAILED)
  attempts: Int
  lastAttemptAt: DateTime?
  nextRetryAt: DateTime?
  failureReason: String?
  variables: Json? — template variables stored for retry replay

Retry cron: app/api/cron/retry-emails/route.ts
  Schedule: every 5 minutes (vercel.json)
  Batch size: 50 per run
  Auth: CRON_SECRET bearer token (same as all other crons)
  Pattern: orchestrator only — calls retrySendFromLog(logId), never sends directly

retrySendFromLog(logId) — exported from send.ts, used by cron only.
  Reads stored variables from log entry and replays via attemptSend().

---

## Database models

  EmailTemplate      — per-tenant template overrides (subject, preview, HTML)
  EmailSendLog       — append-only audit trail (QUEUED → SENT → DELIVERED/BOUNCED)
  EmailUnsubscribe   — per-tenant opt-out registry
  EmailDomain        — sender domain verification (Resend)
  EmailRateLimit     — append-only send log for rate limiting
  MagicLinkToken     — email-based auth tokens (tenant+email scoped)

---

## Key files

- Send layer: `app/_lib/email/send.ts`
- Registry: `app/_lib/email/registry.ts`
- Rate limit: `app/_lib/email/rate-limit.ts`
- Templates: `app/_lib/email/templates/`
- Unsubscribe: `app/_lib/email/unsubscribe-token.ts`
- Email triggers: `app/_lib/integrations/sync/email-triggers.ts`
- Magic link: `app/_lib/magic-link/`
- Guest session: `app/_lib/magic-link/session.ts`
- Admin UI: `app/(admin)/settings/email/`
- Resend webhook: `app/api/webhooks/resend/route.ts`

---

## Email invariants — never violate these

1. sendEmailEvent() is the ONLY way to send email
2. Email failures NEVER abort sync or throw to callers
3. safeSend() wraps all trigger calls — log and swallow errors
4. Rate limiting is fail-open — availability over perfect limiting
5. Unsubscribe check is always first, before any template work
6. portalUrl in emails uses tenant subdomain, not NEXT_PUBLIC_APP_URL
7. emailFrom is set atomically on tenant creation — never null in steady state
8. One-click unsubscribe headers on every outgoing email
9. Template variables are rendered with {{var}} — unknown vars kept as-is
10. Dedup timestamps on Booking prevent duplicate notification emails
11. Never call resendClient directly — always go through sendEmailEvent()
12. PERMANENTLY_FAILED emails must be visible in admin monitoring
