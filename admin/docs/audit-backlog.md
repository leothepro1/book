# Audit backlog

Tracks follow-up items from the 2026-04-21 DB-infra audit day. Items are
grouped by priority and status. Move items to "Completed" when shipped
with a commit reference.

Last updated: 2026-04-21

---

## 🔴 Critical follow-ups (do before camping-live)

### Rotate R2 credentials
- **Why:** Access Key ID + Secret Access Key appeared in chat history
  during backup setup on 2026-04-21. They must be considered leaked.
- **Action:**
  1. Cloudflare dashboard → R2 → Manage R2 API Tokens
  2. Create new token scoped to `booking` bucket, Object Read & Write
  3. Update `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` in GitHub secrets
  4. Revoke old token in Cloudflare
  5. Trigger db-backup workflow manually → confirm green
- **Risk of delay:** Anyone with chat-log access could download the R2
  bucket contents (backups include all customer data).
- **Blocker:** none. Can be done immediately.

### Rotate Neon `neondb_owner` password
- **Why:** Password appeared in chat history during fas A–C of
  migration work. Low blast-radius (private repo, no external exposure),
  but should be rotated before production traffic arrives.
- **Action:**
  1. Neon console → project → Branches → main → Roles → `neondb_owner`
  2. Reset password (Neon generates a new one)
  3. Update `NEON_DIRECT_URL` in Vercel env vars + GitHub secrets
  4. Redeploy Vercel (triggers pool reconnect)
  5. Health endpoint `/api/health/ready` → `status: ok` confirms
- **Risk of delay:** Similar to R2 — leaked in chat but not in public
  git history. Camping-live introduces real-money traffic and makes
  the blast radius much bigger.
- **Blocker:** none; can be coordinated alongside R2 rotation.

---

## 🟠 Core 4 completion — Område 2 (DR runbook formalisering)

Area 2 is partially done (`db-restore.md` covers scenarios). These items
close the remaining gaps.

### Maintenance-mode endpoint/flag
- **Why:** `db-restore.md` Scenario A step 1 "Freeze writes" has three
  interim options today, none clean. We need a first-class
  maintenance-mode so the runbook has a defensible "freeze writes"
  action.
- **Spec suggestion:**
  - Env var: `MAINTENANCE_MODE=1` (read by middleware)
  - Middleware: returns HTTP 503 with JSON
    `{ status: "maintenance", message: "..." }` for all non-health routes
  - Health endpoints stay up (so monitors don't misfire)
  - Toggle via Vercel env var dashboard + redeploy (~2 min)
- **Blocker:** none. ~4h of work.

### SLO document with formalized RPO/RTO tiers
- **Why:** RPO/RTO tiers were discussed during the fas B audit but never
  committed as a document. Camping-live + customer contracts will need
  this referenced.
- **Content (already specced — see `db-restore.md` + chat history):**
  - Tier 1 (payments): RPO ≤ 1 min, RTO ≤ 15 min read / ≤ 60 min write
  - Tier 2 (bookings): RPO ≤ 15 min
  - Tier 3 (telemetry): RPO ≤ 24h
- **Location:** `admin/docs/slo.md` (new file)
- **Blocker:** none. ~2h of work.

### Post-mortem template
- **Why:** `db-restore.md` "After any restore" step references a
  post-mortem doc but no template exists. Solo founder will skip
  post-mortems without scaffolding.
- **Location:** `admin/docs/runbooks/post-mortem-template.md`
- **Content:** timestamp detected / resolved / data loss / lessons /
  preventive actions
- **Blocker:** none. ~1h of work.

### Quarterly DR-drill calendar system
- **Why:** `db-backup.md` says "quarterly DR drill" but no mechanism
  prompts us to do it. Solo founder will forget.
- **Options:**
  - Calendar reminder (Google Calendar) + trigger workflow manually
  - A separate `drill-reminder.yml` GHA workflow that opens an Issue
    quarterly reminding to run `db-restore-drill.yml`
  - Option B is preferred (self-documenting, issue survives reminders
    being ignored)
- **Blocker:** none. ~1h of work.

---

## 🟡 Bonus integrations (Område 3 impliceringar)

### Vercel deployment checks against `/api/health/ready`
- **Why:** Vercel can auto-rollback a deployment if a health check
  fails post-deploy. Today we'd only notice via external monitor or
  Sentry noise.
- **Action:**
  - Vercel dashboard → project → Settings → Deployment Protection
  - Add post-deployment check pointing at
    `https://www.rutgr.com/api/health/ready`
  - Expected: 200 JSON within 30s timeout
- **Blocker:** none. ~15 min setup.

### External uptime monitor
- **Why:** If Vercel itself is down, Vercel deployment checks don't
  help. An out-of-band monitor catches platform-level outages.
- **Options:** BetterStack (preferred — richer dashboards),
  UptimeRobot (free tier), Checkly (scripted tests)
- **Monitors:**
  - `/api/health` — every 1 min — expect 200 with `status: ok`
  - `/api/health/ready` — every 5 min — expect 200 with overall
    `status: ok`
  - Separate alerts for liveness failure (paging) vs readiness
    degradation (email)
- **Blocker:** choice of vendor. ~30 min setup after decision.

### Sentry Alert Rule for `health.check_down` events
- **Why:** The readiness endpoint calls `Sentry.captureMessage` on
  every `down` check. Those land in Sentry but don't page by default.
- **Action:**
  - Sentry → Alerts → Create Alert Rule
  - Condition: `event.message` contains `health.check_down`
  - Action: Slack/email notification
- **Blocker:** none. ~15 min setup.

---

## 🟡 Pre-camping-live requirements

### Load-test harness
- **Why:** Camping-live target is 35M SEK/year gross bookings, seasonal
  peaks. Need to verify 100 concurrent checkouts complete at p95 ≤ 500ms
  before launch.
- **Spec:**
  - Tool: k6 or Artillery (scripted checkout flows)
  - Scenarios: availability search → add-to-cart → checkout → Stripe
    test mode → order confirmation
  - 100 concurrent users ramp, 10 min steady state
  - Assertions: p95 ≤ 500ms, error rate < 0.1%, no DB pool exhaustion
- **Blocker:** test-mode Stripe account + test data seed. ~8h of work.

### Tenant-isolation audit
- **Why:** CLAUDE.md non-negotiable: "Zero cross-tenant data leakage
  under any failure mode." We've verified tenant-isolation smoke
  (`/api/health/ready`) but haven't formally audited all read+write
  paths.
- **Scope:**
  - Every Prisma query in `app/` and `app/api/`
  - Every `resolveTenantFromHost` invocation path
  - Every middleware-resolved tenantId → DB query chain
- **Deliverable:** audit report in `admin/docs/tenant-isolation-audit.md`
  with grep findings + fixes
- **Blocker:** 1–2 days of careful review work.

### Pre-arrival email-flow end-to-end verification
- **Why:** Pre-arrival emails are a customer-facing commitment
  (reminders N days before arrival). Cron runs `pre-arrival-reminder`
  daily at 08:00 UTC but we haven't verified end-to-end since Neon
  migration.
- **Action:**
  - Seed test booking with `arrival` in 2 days
  - Trigger cron manually or wait for 08:00 UTC
  - Verify email arrives via Resend dashboard
  - Verify booking's `preArrivalEmailSentAt` timestamp updates
- **Blocker:** none. ~30 min verification.

---

## 📅 Completed

(Items move here with commit SHA when shipped.)

### 2026-04-21 — DB infra audit day
- ✅ Område 1 Backup (c09776e, 62d2acd, d05b105, 504bcac → dfdf2ec)
  — nightly pg_dump to R2 + restore-drill, runbooks, verified
- ✅ Område 3 Health endpoint (4277b50, 4917931, bf3e020)
  — liveness + readiness + check registry, Clerk bypass,
  Vercel fra1 region pin
- ✅ Område 4 Schema drift detection (1be460d)
  — PR gate (migrations ↔ schema) + nightly cron (schema ↔ prod)
- ✅ Render → Neon migration (d2a74fc, 8341597)
  — baseline squash, orphan cleanup, rollback runbook
