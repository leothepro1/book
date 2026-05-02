# Phase 3.5 — Staging environment setup

This document is the operator runbook for activating the
`apelviken-staging.rutgr.com` staging environment after Phase 3.5
infrastructure code merges.

The code changes (Prisma migration, `environment.ts` helper, seed
script) ship in the Phase 3.5 PR. The actual environment activation
— Clerk org, seed run, Vercel domain alias — is operator (Leo) work
done after merge.

Once steps 1–3 are complete, the Phase 3 PR-B 20-item manual smoke
checklist (`docs/analytics/phase3-manual-smoke.md`) becomes runnable
against `https://apelviken-staging.rutgr.com`.

---

## Two complementary flags — read this first

Phase 3.5 introduces a tenant-level environment flag. There is also
a pre-existing integration-level demo flag. They are NOT
interchangeable; they serve different purposes at different layers.

| Flag | Model | Driven by | Drives |
|---|---|---|---|
| `Tenant.environment` | `Tenant` (Phase 3.5) | Phase 3.5 seed script | Phase 5+ aggregation queries — `PRODUCTION_TENANT_FILTER` excludes staging from prod metrics |
| `TenantIntegration.isDemoEnvironment` | `TenantIntegration` (pre-existing) | Phase 3.5 seed script (sets to `true`) | PMS/payment adapters — fake-mode behavior, no real Mews writes |

The seed script (`scripts/seed-staging-tenant.ts`) sets BOTH flags
on the staging tenant. Future code that conflates them risks either
polluting production aggregations OR running real Mews writes
against the staging tenant.

When in doubt: aggregations care about `Tenant.environment`;
adapters care about `TenantIntegration.isDemoEnvironment`.

---

## Step 1 — Create separate Clerk org for staging

The seed script's hardcoded `clerkOrgId` is a SENTINEL placeholder
(`"seed_staging_org"`). Auth flows will not work until the operator
provisions a real Clerk org and re-keys.

### 1a. Provision Clerk org

1. Open Clerk dashboard → **Bedfront DEV** application (the test-mode
   instance whose keys are in `.env` as `pk_test_…` / `sk_test_…`).
2. Navigate to **Organizations** → **Create organization**.
3. Name: `Apelviken Staging` (or any name that distinguishes it from
   the production Apelviken org).
4. Once created, copy the org id (format: `org_*`).

### 1b. Re-key the staging tenant

Two options. Pick the one that matches your workflow:

**Option A — Re-run seed with the real org id (preferred):**

```bash
STAGING_CLERK_ORG_ID=org_REAL_ID \
  npx tsx scripts/seed-staging-tenant.ts
```

The seed is idempotent. Re-running with the new env var updates
`Tenant.clerkOrgId` in place via `upsert`.

**Option B — Direct DB update (if seed has already run with sentinel):**

```bash
psql "$DATABASE_URL" -c \
  "UPDATE \"Tenant\" SET \"clerkOrgId\" = 'org_REAL_ID' \
   WHERE \"portalSlug\" = 'apelviken-staging'"
```

### 1c. Add operator user to the staging org

In the Clerk dashboard, add Leo's user account (or whichever user
will run manual smoke) as an admin/owner of the new staging org.
Without membership, the operator cannot sign in to the staging
admin surface to verify the storefront.

---

## Step 2 — Run the seed script

After Step 1, run:

```bash
STAGING_CLERK_ORG_ID=org_REAL_ID \
  npx tsx scripts/seed-staging-tenant.ts
```

The script enforces a `--allow-sentinel` guard against accidental
runs without the env var. If you intentionally want to run with the
sentinel (e.g. infrastructure setup BEFORE Step 1 completes), pass
`--allow-sentinel`:

```bash
STAGING_CLERK_ORG_ID=seed_staging_org \
  npx tsx scripts/seed-staging-tenant.ts --allow-sentinel
```

Without `--allow-sentinel`, the script hard-fails with stderr
instructions. This is intentional defense-in-depth against
accidental runs that leave the tenant in a broken auth state.

**What the seed creates / updates (idempotent):**

- `Tenant` row with `portalSlug = "apelviken-staging"`,
  `environment = "staging"`, `slug = "apelviken-staging"`,
  `name = "Apelviken (staging)"`. No Stripe Connect account.
- `TenantIntegration` row with `provider = "fake"`,
  `isDemoEnvironment = true`, empty credentials buffer. FakeAdapter
  ignores credentials.
- `TenantPaymentConfig` row with `providerKey = "manual"`. No real
  Stripe webhooks ever fire on this tenant.
- `AnalyticsPipelineTenantConfig` row with `pipelineEnabled = true`.
  Required for `/api/analytics/collect` to accept events.

**Visual differentiation:** the staging tenant ships with a different
button color (`#FF6B35` orange instead of production purple) so a
glance at the storefront tells you which environment you're on.

---

## Step 3 — Vercel domain alias

The Vercel project `apelvikenbooking` (org `bedfront`) needs a domain
alias for `apelviken-staging.rutgr.com`.

1. **Vercel dashboard** → project `apelvikenbooking` → **Settings**
   → **Domains** → **Add Domain**.
2. Enter `apelviken-staging.rutgr.com`.
3. Vercel will display DNS configuration instructions:
   - Most likely: `CNAME apelviken-staging` → `cname.vercel-dns.com`
   - Or: `A apelviken-staging` → Vercel's anycast IPs
4. Add the DNS record at your DNS provider for `rutgr.com`.
5. Wait for DNS propagation (typically minutes; up to 24h).
6. Vercel auto-provisions SSL via Let's Encrypt once DNS verifies.
7. Status panel shows ✓ **Valid Configuration** when ready.

**Verify resolution:**

```bash
dig apelviken-staging.rutgr.com +short
# Should return Vercel's CNAME or IPs

curl -sS -o /dev/null -w "%{http_code}\n" \
  https://apelviken-staging.rutgr.com/
# Should return 200 (storefront index)
```

---

## Step 4 — Smoke verification

With Steps 1–3 complete, the Phase 3 PR-B manual smoke checklist
(`docs/analytics/phase3-manual-smoke.md`) is runnable.

1. Open `https://apelviken-staging.rutgr.com` in an incognito window.
2. Confirm the storefront renders. Visual cue: the staging button
   color is orange (`#FF6B35`); production is purple.
3. Open DevTools → Network. Confirm `runtime-manifest.json` loads,
   then `loader.<hash>.js` (immutable cache header), then a request
   to `/api/analytics/collect` after consent.
4. Run the 20 checklist items. Document each result as a PR comment.

**Bug protocol:** per Phase 3.5 PR's stated discipline, any bug
found via smoke gets its own fix-PR. Phase 3.5 merges with the
smoke results documented as "passed" or "flagged for follow-up PR
#XXX".

---

## ⚠️ Cron pollution warning

Vercel deploys ALL cron jobs in `vercel.json` to every environment.
The staging deployment runs 32 cron jobs unconditionally. Most are
no-ops against the FakeAdapter (PMS reconciliation finds no real
data, expire-reservations sweeps zero rows, etc.). Three are
operational risks:

| Cron path | Schedule | What it does | Staging consequence |
|---|---|---|---|
| `/api/cron/email-marketing-sync` | `0 3 * * *` (nightly) | Pulls list/segment data from Mailchimp / Klaviyo and pushes back via the email-marketing app adapter | Real third-party API writes against the email-marketing provider configured for the staging tenant. If staging is wired to the same provider account as production, can corrupt production lists. |
| `/api/cron/send-campaigns` | `*/5 * * * *` (every 5 min) | Sends queued email campaigns via the configured provider (Mailchimp / Klaviyo / etc.) | Real outbound emails. If a staging campaign accidentally has real recipient addresses (e.g. Apelviken's actual guest list), they receive staging mail. |
| `/api/cron/segment-sync` | `0 3 * * *` (nightly) | Pushes guest segments to the configured third-party segmentation API | Real third-party API writes. Cross-contamination potential. |

**Current mitigation (Phase 3.5):** none. The staging seed sets
`TenantPaymentConfig.providerKey = "manual"` and
`TenantIntegration.provider = "fake"` so PMS-related crons are
no-ops, but the email-marketing and segment-sync crons are NOT
gated on adapter type — they run if a tenant has the corresponding
app installed.

**Recommended mitigation:** install zero email-marketing and
segment apps on the staging tenant. The crons see no work to do
and exit early. This is the operator's responsibility during Step 2
follow-up — verify the staging tenant has empty `tenantApps`.

**Long-term fix:** tracked in
[`docs/analytics/cron-staging-isolation.md`](./cron-staging-isolation.md)
as a follow-up issue. The proposed pattern is a
`shouldRunCronForTenant(tenant)` helper that all cron handlers
import; staging tenants short-circuit by default unless a route
explicitly opts in.

---

## Operational matrix — what's safe to do on staging

| Action | Safe on staging? | Why |
|---|---|---|
| Create test bookings via storefront | ✓ | FakeAdapter handles them; no real Mews writes |
| Process payments via Stripe Connect | ✗ | No Stripe account attached; manual provider only |
| Send transactional emails (booking confirmations) | ⚠️ | Goes through `sendEmailEvent`; real Resend mail unless tenant uses `noreply@apelviken-staging.rutgr.com` (which has no DNS) — likely bounces |
| Run analytics events | ✓ | `Tenant.environment="staging"` keeps them out of Phase 5+ aggregations |
| Test the consent banner UI | ✓ | This is the primary purpose of Phase 3.5 |
| Add real customer email addresses anywhere | ✗ | Staging is for synthetic test data only |

---

## Tear-down (if you ever want to remove the staging tenant)

```sql
DELETE FROM "TenantIntegration"           WHERE "tenantId" = (SELECT id FROM "Tenant" WHERE "portalSlug" = 'apelviken-staging');
DELETE FROM "TenantPaymentConfig"         WHERE "tenantId" = (SELECT id FROM "Tenant" WHERE "portalSlug" = 'apelviken-staging');
DELETE FROM "analytics"."tenant_config"   WHERE tenant_id  = (SELECT id FROM "Tenant" WHERE "portalSlug" = 'apelviken-staging');
DELETE FROM "Tenant"                      WHERE "portalSlug" = 'apelviken-staging';
```

Plus remove the Vercel domain alias and the Clerk staging org.

The seed script is idempotent — you can also re-run it after
tear-down to recreate.

---

## Forward compatibility

- **Phase 4 CDC:** the Phase 5+ aggregation pattern documented here
  applies. Phase 4 readers/projectors that consume from
  `analytics.event` should filter on `Tenant.environment` if they
  care about production-only data.
- **Multiple staging tenants:** the seed script is hardcoded to
  `portalSlug = "apelviken-staging"`. Adding a second staging tenant
  requires a parameterized seed (operator can copy the script and
  edit, or extend with `--portal-slug` flag).
- **Production tenants migrating to multi-environment:** out of
  scope for Phase 3.5. Currently a tenant has exactly one
  environment value. If a future feature requires the same Tenant
  to have both production and staging deployments simultaneously,
  consider a join table (`TenantEnvironment(tenantId, envName)`)
  rather than overloading `Tenant.environment`.
