# Cron staging isolation — follow-up tracking

**Status:** OPEN. Tracked for Phase 3.5+1 follow-up PR.

**Created:** 2026-05-01 during Phase 3.5 staging-environment work.

**Owner:** unassigned.

---

## Problem

The Vercel deployment serves both production and staging traffic from
the same build artifact. `vercel.json` defines 32 cron jobs that run
unconditionally — there is no `vercel.json` per-environment override
for crons.

The staging tenant (`portalSlug = "apelviken-staging"`,
`environment = "staging"`) is therefore subject to all 32 crons. Most
are no-ops by accident (FakeAdapter has nothing to reconcile;
expire-reservations sweeps zero rows; etc.) but three crons touch
real third-party APIs and pose operational risk:

- `/api/cron/email-marketing-sync` — Mailchimp / Klaviyo writes
- `/api/cron/send-campaigns` — outbound transactional sends
- `/api/cron/segment-sync` — third-party segmentation API

If the staging tenant ever has these apps installed, the crons will
make real third-party calls against credentials that may be shared
with production accounts.

The Phase 3.5 mitigation — "don't install those apps on the staging
tenant" — works as long as operators remember. That's not
Shopify-grade. We should make safety the default behavior.

---

## Possible mitigations

Listed in increasing intervention size. The first option that
durably solves the problem is the right one.

### Option 1 — Per-route `shouldRunCronForTenant(tenant)` guard (recommended)

Add a helper in `app/_lib/cron/staging-guard.ts`:

```typescript
import { isStagingTenant } from "@/app/_lib/analytics/pipeline/environment";

const STAGING_OPT_IN_CRONS = new Set<string>([
  // Routes that genuinely should run on staging.
  // Default is: empty — staging skips all crons.
]);

export function shouldRunCronForTenant(
  tenant: { environment: string },
  routePath: string,
): boolean {
  if (!isStagingTenant(tenant)) return true;
  return STAGING_OPT_IN_CRONS.has(routePath);
}
```

Each cron route handler calls this before doing real work:

```typescript
for (const tenant of activeTenants) {
  if (!shouldRunCronForTenant(tenant, "/api/cron/email-marketing-sync")) continue;
  // … real work
}
```

Pros: minimal infrastructure change, opt-in by route, easy to reason
about, covered by unit tests.

Cons: every cron route needs the call added. ~32 routes; ~5 LOC each.
Tedious but mechanical.

### Option 2 — Env-var feature flags per cron

Add `CRON_<ROUTE>_ENABLED_FOR_STAGING` env vars; routes check them.

Pros: zero code change in route bodies if we use a generic loader.

Cons: 32 env vars, easy to forget one, env-var sprawl.

### Option 3 — Separate Vercel project for staging

Create a second Vercel project that deploys the same code but with
its own `vercel.json` containing only the cron schedule we want for
staging.

Pros: most thorough isolation. Can tune cron cadence per environment.

Cons: heavy. Two builds, two deployments, two domain configs, two
sets of env vars to keep in sync. Risk of drift between projects.

### Option 4 — Wait for Vercel to ship per-environment cron support

Vercel could, in principle, support `crons.production.*` and
`crons.preview.*` keys in `vercel.json`. They don't today.

Pros: zero code change.

Cons: indefinite timeline; no commitment from Vercel.

---

## Recommendation

**Option 1.** Mechanical, scoped, defensive by default, easy to
review. Roll out in two steps:

1. **Step 1 (this follow-up PR):** add the helper and call it from
   the three high-risk routes (`email-marketing-sync`,
   `send-campaigns`, `segment-sync`). Default behavior: staging
   tenants skip these crons.
2. **Step 2 (future PR if needed):** extend the helper call to all
   32 cron routes. Lower priority — the other 29 are already
   no-ops on staging by virtue of FakeAdapter and `manual` payment
   provider.

---

## Acceptance criteria

This issue is resolved when:

- [ ] `app/_lib/cron/staging-guard.ts` exists with
      `shouldRunCronForTenant(tenant, routePath)` and unit tests.
- [ ] The three high-risk routes call the guard before doing real
      work.
- [ ] A vitest covers each route's guard call (e.g.
      `email-marketing-sync.test.ts: skips staging tenant by default`).
- [ ] `phase3-5-staging-setup.md` updated to remove the "Cron
      pollution warning" section (or amended to say the warning is
      mitigated by the guard).
- [ ] No regression in production cron behavior (production tenants
      always pass the guard).

---

## Why this is a follow-up, not part of Phase 3.5

Phase 3.5's scope is staging-environment infrastructure + cleanup.
The cron-pollution issue was discovered during recon, but the fix
itself is independent code that:

1. Doesn't unblock the Phase 3 manual smoke (the smoke runs
   storefront paths, not cron paths).
2. Has its own design decisions (which routes opt-in by default,
   how the guard's signature evolves) that benefit from a focused
   review.
3. Bundling it into Phase 3.5 would expand the PR scope and bury
   the cron-isolation review under cleanup commits.

This doc preserves the context so the follow-up doesn't get lost.
