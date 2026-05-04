# Analytics — Shopify-grade Architectural Audit

**Datum:** 2026-05-04
**Författare:** Bedfront platform-team (synthesis)
**Källor:**

- `admin/_audit/analytics-external-research.md` (Track 1, external research,
  fetched 2026-05-04, merged via PR #42)
- Codebase-audit av prompt-engineer (Track 2, 2026-05-04)
- Faktisk codebase-verifiering 2026-05-04 (every gap-claim cross-checked
  against `git log` HEAD `345a269`)

**Standard:** *"Skulle Shopifys Platform-team merge:a denna service?"* +
*"Skulle vi kunna drifta detta i prod vid 10k tenants?"*

This is an audit artifact — every claim is grounded in either a Track 1
reference (with §-pointer) or a Bedfront file:line citation, never in
opinion. Where my codebase-verification disagreed with the prompt's
suggested classification, I've kept the verified version and noted the
divergence explicitly.

---

## A. Executive summary

### 28 audit-frågor mappade

| Kategori | ✅ Covered | ⚠️ Partial | ❌ Gap |
|---|---|---|---|
| D.1 Schema governance (4) | 3 | 1 | 0 |
| D.2 Pipeline reliability (5) | 4 | 1 | 0 |
| D.3 Privacy + compliance (4) | 2 | 1 | 1 |
| D.4 Observability + SLOs (4) | 0 | 2 | 2 |
| D.5 Scalability + cost (4) | 2 | 1 | 1 |
| D.6 Multi-tenant isolation (3) | 2 | 0 | 1 |
| D.7 Data quality (2) | 0 | 1 | 1 |
| D.8 Disaster recovery (2) | 1 | 0 | 1 |
| **Total** | **14/28 (50%)** | **7/28 (25%)** | **7/28 (25%)** |

> **Note on the table:** the prompt suggested 11/6/11. Codebase
> verification produced 14/7/7. The two largest re-classifications are
> in D.5 #18 (partitioning DDL exists per `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:47` —
> what's missing is lifecycle automation, so this is ⚠️ Partial not ❌ Gap)
> and D.2 #6 (failed events go to outbox-with-`[DLQ]`-marker plus
> `scripts/replay-dlq.ts`, so this is ⚠️ Partial not ❌ Gap). The gap
> distribution is otherwise identical — observability is still the
> weakest cluster.

### Skarp läsning

Arkitektur-fundament är **Shopify-grade**:

- Schema-as-contract two-layer (emit + drain validation) matches Shopify
  Monorail (Track 1 §B.1) — confirmed at
  `app/_lib/analytics/pipeline/schemas/registry.ts:1-22`.
- Transactional outbox + Inngest drainer matches Chris Richardson's
  canonical pattern (Track 1 §B.7) — confirmed at
  `inngest/functions/drain-analytics-outbox.ts:1-35`.
- Pre-aggregation (`analytics.daily_metric` v2) defers the OLAP-DB
  decision the way Shopify's "exploration data models" do (Track 1
  §B.1) — confirmed at
  `app/_lib/analytics/aggregation/aggregate-day-runner.ts`.
- Tenant-scoped queries enforced by static check matches Citus row-based
  pattern at our scale (Track 1 §B.11) —
  `scripts/verify-phase5a-aggregator.ts` check #10.
- Idempotent re-run via composite-unique upsert (Track 1 §B.7) —
  `prisma/migrations/20260504144722_analytics_phase5a_aggregator/migration.sql:35-39`.

Gaps koncentreras i **observability + operational + DR** — inte i
grunden, utan i instrumentering och driftsmognad. The pipeline can
process events at Shopify-grade quality; we can't yet *operate* it at
Shopify-grade quality (no SLO alerting, no analytics-specific health
endpoint, no DR runbook, no analytics RTBF flow).

### Top 6 production blockers (Tier 1)

These must ship before Apelviken go-live (October 2026). Each carries a
recon prompt in §D.

1. **Partition lifecycle automation** —
   `analytics.event` is partitioned monthly through 2026-10 (per
   `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:51-69`)
   but no auto-create-ahead cron and no drop-old-partitions GC. Once we
   pass November 2026, new events land in `event_default`, which the
   foundation migration explicitly calls out as a "should never carry
   rows in steady state" safety net (lines 66-68).

2. **SLO alerting saknas helt** —
   `docs/analytics/tiers.md` defines tier SLOs (Tier 2: 99.9% uptime,
   15min freshness, p95 < 500ms — lines 30-44) but no per-service tier
   mapping, no alert rules wired (Sentry/Datadog/Honeycomb), no error-
   budget tracking. We have Sentry breadcrumbs and spans
   (`app/_lib/analytics/pipeline/observability.ts`) but not SLO-driven
   alerting.

3. **Analytics health endpoint + admin dashboard saknas** —
   `/api/admin/pms-reliability/health/route.ts` exists for the PMS
   pipeline but there's no analytics equivalent. Track 1 §B.10
   establishes that pipeline-health observability is canonical.

4. **Failed-events table + admin UI för DLQ saknas** —
   DLQ pattern IS implemented at the outbox-row level (per
   `inngest/functions/drain-analytics-outbox.ts:259-277`,
   `scripts/replay-dlq.ts`) but Snowplow's "non-lossy pipeline with a
   separate failed-events table" pattern (Track 1 §B.2) is not. No way
   to triage DLQ rows from the admin UI.

5. **DR-runbook + JSONL-export-tooling för analytics saknas** —
   `docs/runbooks/pms-reliability-dr.md` + `scripts/pms-reliability/{export,import,verify}.ts`
   exist for the PMS pipeline. No analytics equivalent.

6. **GDPR RTBF-flow för analytics events saknas** —
   Per Track 1 §B.8, GDPR Recital 26 mandates that pseudonymized data
   (Bedfront's `user_agent_hash`, `actor_id` pseudonyms) must support
   the right-to-be-forgotten flow. No mechanism currently exists to
   purge analytics events for a specific GuestAccount or
   user_agent_hash.

---

## B. Per-question findings

### D.1 Schema governance

#### D.1 #1 — Schema-registry both emitter and reader consult

**Track 1 reference:** §B.1 (Shopify Monorail), §B.2 (Snowplow Iglu),
§B.3 (Segment Protocols)

**Pattern:** Every well-documented external system treats schema as
system-of-record, not the emitting code. Shopify's Monorail "*adds
structure to the raw Kafka events before producing it to Kafka*"
(§B.1, verbatim). Snowplow's Iglu makes data self-describing via
embedded SchemaKey (§B.2). Segment Protocols *"validates event
payloads against tracking plans during the ingestion phase"* (§B.3).

**Status: ✅ Covered**

**Vårt:**

- `app/_lib/analytics/pipeline/schemas/registry.ts:1-22` — Zod-based
  registry, single source of truth. Header docstring says verbatim:
  *"Two layers of validation use the same registry: The emitter
  validates the payload BEFORE writing to outbox. A buggy operational
  caller can never persist a malformed event. The drainer (Phase 1B)
  re-validates against the same schema BEFORE writing from outbox to
  analytics.event."*
- `app/_lib/analytics/pipeline/emitter.ts:50` — emitter imports
  `analyticsBreadcrumb, analyticsSpan` from observability and uses the
  registry to validate pre-write.
- `inngest/functions/drain-analytics-outbox.ts:188-203` —
  `processRow()` calls `getEventSchema(row.event_name,
  row.schema_version)` then `schema.parse(candidate)` before INSERT.
- `app/_lib/analytics/pipeline/schemas/validator-parity.test.ts` —
  worker hand-rolled validators have a parity test against Zod
  schemas (matches Snowplow's iglu lockstep discipline).

**Notes:** Two-layer validation is defense-in-depth, exactly Shopify
Monorail's pattern. Worker-validator parity is unique to Bedfront —
forced by the worker's 30 KB tree-shake budget per `admin/CLAUDE.md`
"Analytics pipeline — worker validator parity rule". Stronger than
Snowplow which relies on a single validation layer.

---

#### D.1 #2 — Schema versioning (SchemaVer-style)

**Track 1 reference:** §B.2 (Snowplow MODEL/REVISION/ADDITION), §B.5
(Stripe API-version-per-endpoint, monthly non-breaking + twice-yearly
breaking)

**Pattern:** Snowplow's SchemaVer uses MODEL-REVISION-ADDITION with
hyphens (verbatim §B.2: *"this visual distinction helps analysts
understand whether a table was versioned using SemVer or
SchemaVer"*). Stripe pins each webhook endpoint to a specific
api_version with explicit upgrade path.

**Status: ⚠️ Partial**

**Vårt:**

- `app/_lib/analytics/pipeline/schemas/registry.ts:96-111` — same
  event_name can have multiple versions live simultaneously (e.g.
  `cart_started: { "0.1.0": CartStartedV010Schema, "0.2.0":
  CartStartedSchema }`). This matches Stripe's pinned-version pattern
  per webhook endpoint.
- `app/_lib/analytics/pipeline/schemas/registry.ts:14-22` — versioning
  policy defined: *"PATCH for additive optional fields, MINOR for
  additive required fields with a default, MAJOR for anything that
  could break a downstream consumer."*
- Legacy schemas preserved in `legacy/` until outbox drains
  v0.1.0 events out — concrete forward-migration discipline.

**Gap:** We use SemVer dotted format (`0.1.0`, `0.2.0`), not
Snowplow's SchemaVer hyphenated MODEL-REVISION-ADDITION. The semantic
content is similar (PATCH≈ADDITION, MINOR≈REVISION, MAJOR≈MODEL) but
the wire-format and developer-mental-model differ. Snowplow's
hyphen-separator is *deliberate* per Track 1 §B.2 — it visually
distinguishes "schema version" from "code version" in column names.

**Priority: Tier 3** — naming convention only. Functional behavior
matches Snowplow's. Conversion is mechanical (add a `-` for `.`
mapping). Not a production blocker.

---

#### D.1 #3 — Naming convention enforced

**Track 1 reference:** §B.4 (Amplitude data taxonomy, Object-Action /
Noun + Past-Tense Verb)

**Pattern:** Amplitude playbook (§B.4 verbatim): *"consistent
syntax: Use [Noun] + [Past-Tense Verb] format (e.g., Song Played not
Played Song)"*. Examples: Search Completed, Product Added, Order
Completed.

**Status: ✅ Covered**

**Vårt (verified by listing `app/_lib/analytics/pipeline/schemas/`
2026-05-04):**

All 26 active event names follow Object-Past-Tense-Verb consistently:

- accommodation_archived, accommodation_published, accommodation_viewed
- availability_searched
- booking_cancelled, booking_completed, booking_imported,
  booking_modified, booking_no_show
- cart_abandoned, cart_started, cart_updated
- checkout_started
- discount_created, discount_expired, discount_used
- guest_account_created, guest_account_linked, guest_authenticated,
  guest_otp_sent
- page_viewed
- payment_disputed, payment_failed, payment_refunded, payment_succeeded
- pms_sync_failed, pms_sync_recovered

**Notes:** snake_case (Bedfront) vs Title Case (Amplitude default) is
a stylistic difference — the structural convention (Noun + Past-Tense
Verb) matches. snake_case is Snowplow's convention too (§B.2 docs).

**Gap:** No automated naming-convention check (regex against new
event-name additions). Risk: a future contributor adds
`process_payment` instead of `payment_processed` and breaks the
pattern silently.

**Priority: Tier 3** — conventional discipline holds today via review,
add a static check for safety. ~30 LOC.

---

#### D.1 #4 — Schema typing richness (regex/ranges/enums)

**Track 1 reference:** §B.3 (Segment Protocols supports regex on
string properties, ISO-8601 for dates)

**Pattern:** Segment Protocols (§B.3): *"For string properties, you
can apply validation through regular expressions"*. Property data
types: `any, array, object, boolean, integer, number, string, null,
Date time`.

**Status: ✅ Covered**

**Vårt (verified at
`app/_lib/analytics/pipeline/schemas/payment-succeeded.ts:107-126`):**

- `z.enum(["stripe", "swedbankpay", "manual", "other"])` — closed-set
  enums for provider
- `z.enum(["card", "bank_transfer", "wallet", "other"])` —
  payment_instrument
- `z.enum(["direct", "admin_draft", "pms_import",
  "third_party_ota", "unknown"])` — source_channel
- `z.number().int().nonnegative()` — amount in minor units
- `z.string().length(3)` — currency (ISO 4217)
- `z.string().min(1)` — non-empty string
- `z.literal("payment_succeeded")` — schema discriminator
- `z.string().regex(ULID_REGEX)` — event_id validation in
  `app/_lib/analytics/pipeline/schemas/base.ts:85`
- `z.string().regex(SEMVER_REGEX)` — schema_version validation
  (line 86)
- `z.string().regex(ISO_DATE)` — date format check in
  `app/_lib/analytics/pipeline/schemas/booking-completed.ts:57`

**Notes:** Zod's full type system gives us strictly more typing
capability than Segment Protocols' string-regex + ISO-8601. Discriminated
unions, intersections, literal types — all available.

---

### D.2 Pipeline reliability

#### D.2 #5 — Outbox or CDC at every emit site

**Track 1 reference:** §B.7 (Chris Richardson canonical outbox pattern,
SeatGeek's Feb 2025 outbox-via-WAL implementation)

**Pattern:** Richardson (§B.7 verbatim): *"The service stores messages
in the database as part of the same transaction that updates business
entities. A separate process then sends the messages stored in the
outbox to the message broker."* Solves the dual-write problem.

**Status: ✅ Covered**

**Vårt:**

- `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:75-91`
  — `analytics.outbox` table created Phase 0.
- `app/_lib/analytics/pipeline/emitter.ts:240-280` —
  `emitAnalyticsEvent(tx, ...)` requires a Prisma transaction client;
  outbox row is committed in the SAME transaction as the business
  write. Pure Richardson outbox.
- `app/_lib/analytics/pipeline/emitter.ts:200-235` —
  `emitAnalyticsEventStandalone()` for cases where there's no
  business-domain transaction (e.g. server-emitted lifecycle events).
- `inngest/functions/drain-analytics-outbox.ts:139-179` —
  drainOneBatch is the relay process. Polling-publisher variant of
  Richardson's pattern (vs Debezium-WAL-tail or SeatGeek's
  pg_logical_emit_message).

**Notes:** Bedfront uses the simpler "polling publisher" branch of
Richardson's tree (per §B.7). Adequate at our scale, weaker on
ordering than log-tailing. SeatGeek's WAL-direct variant is a
known-good upgrade path if ordering becomes critical.

---

#### D.2 #6 — Failed events to separate stream/table

**Track 1 reference:** §B.2 (Snowplow good/bad event pattern;
non-lossy pipeline; separate failed-events table)

**Pattern:** Snowplow (§B.2 verbatim): *"Failed events are NOT
written to your atomic events table, which only contains high
quality data."* Failed events are routed to a separate table in the
warehouse + object-storage backups. *"The pipeline is described as
non-lossy."*

**Status: ⚠️ Partial**

**Vårt:**

- `inngest/functions/drain-analytics-outbox.ts:255-299` — failed
  events stay in `analytics.outbox` with `failed_count++` and
  `last_error` set. After `failed_count > ANALYTICS_DLQ_THRESHOLD`
  (default 5), row is marked `[DLQ]` (line 263) and `published_at`
  set to NOW (line 264) so the drainer ignores it.
- `scripts/replay-dlq.ts:1-25` — manual recovery tool: resets
  `failed_count = 0, last_error = NULL, published_at = NULL` so the
  drainer picks up the row again.
- `app/_lib/observability/inngest-sentry.ts:84-110` — `captureDLQ()`
  fires Sentry with fingerprint `["analytics", "dlq", event_name,
  error_type]` so DLQ patterns group across tenants.

**Gap (vs Snowplow §B.2):** No separate `analytics.failed_events`
table. The `[DLQ]` marker pattern works but conflates "still
queued" rows with "permanently failed" rows in the same physical
table. Snowplow's design separates these so the failed-events table
is searchable by failure-category (Collection / Validation /
Enrichment / Loading) without scanning the live outbox.

**Operational gap:** No admin UI to inspect DLQ rows, only
`tsx scripts/replay-dlq.ts` from a developer machine.

**Priority: Tier 1 (#4)** — non-lossy pipeline is a Shopify-grade
table-stakes property. Recon prompt in §D.4.

---

#### D.2 #7 — Retry ladder with explicit limits + dead-letter

**Track 1 reference:** §B.5 (Stripe: 3-day retry with exponential
backoff; manual replay via Dashboard 15 days / CLI 30 days)

**Pattern:** Stripe (§B.5 verbatim): *"up to three days with an
exponential back off."*

**Status: ✅ Covered**

**Vårt:**

- `inngest/functions/drain-analytics-outbox.ts:93` — Inngest function
  config: `retries: 5` per batch.
- `inngest/functions/drain-analytics-outbox.ts:53` —
  `DEFAULT_DLQ_THRESHOLD = 5`. Per-row retries before DLQ.
- `inngest/functions/drain-analytics-outbox.ts:248-277` — explicit
  failure handling: increment `failed_count`, set `last_error`. After
  threshold breach, set `[DLQ]` + `published_at` to halt retries.
- `app/_lib/observability/inngest-sentry.ts:84-110` — captureDLQ
  reports DLQ events to Sentry with stable fingerprint.

**Notes:** Inngest's exponential-backoff is built in. The 5-retry
budget is shorter than Stripe's 3-day window but appropriate for our
in-process pipeline (vs external webhook delivery). Bedfront's PMS
reliability has a longer ladder (5m → 15m → 1h → 4h → 24h, per
`admin/CLAUDE.md`) — analytics intentionally chose Inngest's faster
retry budget because the failure modes (schema validation, DB write)
are not network-flake-driven.

---

#### D.2 #8 — Event deduplication idempotent

**Track 1 reference:** §B.5 (Stripe: *"guard against duplicated event
receipts by logging the event IDs you've processed"*)

**Status: ✅ Covered**

**Vårt:**

- `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:119-120`
  — `CREATE UNIQUE INDEX outbox_tenant_id_event_id_key ON
  analytics.outbox (tenant_id, event_id)`. Outbox-level idempotency:
  same logical event can never sit in the queue twice.
- `inngest/functions/drain-analytics-outbox.ts:236` — `INSERT INTO
  analytics.event ... ON CONFLICT (event_id, occurred_at) DO
  NOTHING`. Re-drain is no-op if the event was already published.
- `prisma/migrations/20260504144722_analytics_phase5a_aggregator/migration.sql:35-39`
  — `CREATE UNIQUE INDEX
  daily_metric_tenant_id_date_metric_dimension_dimension_valu_key
  ON analytics.daily_metric (tenant_id, date, metric, dimension,
  dimension_value)`. Aggregator upsert can't double-insert.

**Notes:** Three layers of dedup at three pipeline stages — outbox,
event-write, aggregator-write. Matches Stripe's "log event IDs you've
processed" recommendation but enforced at the database constraint
level rather than application logic.

---

#### D.2 #9 — Persisted-before-processing

**Track 1 reference:** §B.7 (Richardson: outbox row commits in same
transaction as business write); §B.2 (Snowplow non-lossy pipeline)

**Status: ✅ Covered**

**Vårt:**

- `app/_lib/analytics/pipeline/emitter.ts:240-280` —
  `emitAnalyticsEvent(tx, ...)` accepts a Prisma transaction client.
  The outbox INSERT is part of the SAME transaction as the business
  write. If business write rolls back, outbox row never persists.
- `inngest/functions/drain-analytics-outbox.ts:143` —
  `_unguardedAnalyticsPipelineClient.$transaction(...)`. Drainer
  wraps SELECT FOR UPDATE + INSERT analytics.event + UPDATE outbox
  in a single transaction. Either all three succeed or all three
  roll back.
- `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:134-136`
  — partial index `outbox_pending_idx ON analytics.outbox
  (published_at, created_at) WHERE published_at IS NULL` — the
  drainer's hot-path scan stays small as steady-state outbox volume
  grows.

---

### D.3 Privacy + compliance

#### D.3 #10 — RTBF for pseudonymized fields

**Track 1 reference:** §B.8 (GDPR Recital 26 verbatim:
*"pseudonymisation, which could be attributed to a natural person by
the use of additional information should be considered to be
information on an identifiable natural person"*)

**Pattern:** Pseudonymized data is still personal data under GDPR.
Right-to-be-forgotten requests must therefore reach pseudonymized
fields too — including `user_agent_hash` (per-tenant salt + 16 hex)
and `actor_id` pseudonyms (e.g. `email_<sha256-16hex>`).

**Status: ❌ Gap**

**Vårt:**

- Pseudonymization correctly identified at design time:
  `app/_lib/analytics/pipeline/schemas/_storefront-context.ts:54-65`
  — *"Cross-tenant isolation: the same browser visiting two tenants
  produces two unrelated hashes, preventing cross-tenant stitching.
  Rotation: when an operator rotates Tenant.settings.analyticsSalt
  (out-of-band action), all subsequent emits produce new hashes."*
- Salt minted at tenant creation:
  `app/api/webhooks/clerk/route.ts:68` (verified 2026-05-04).
- `email_<sha256-16hex>` pseudonym scheme documented in
  `app/_lib/analytics/pipeline/schemas/booking-completed.ts:27-39`.

**Gap:** No RTBF flow exists for analytics events. Specifically:

- No way to identify all `analytics.event` rows for a given
  GuestAccount (would require maintaining a mapping table or
  full-table scan on `actor_id`).
- No way to purge events for a deleted tenant (would require either
  drop-by-tenant_id over partitioned tables or full delete).
- No documented "wipe my history" rotation procedure — Track 1 §B.8
  says rotated salt makes pre-rotation events de facto anonymous
  *only* if the previous salt is destroyed (currently rotation isn't
  implemented at all).
- No connection between Clerk webhook `org.deleted` and analytics
  event purge.

**Priority: Tier 1 (#6)** — GDPR is a hard regulatory requirement,
not a quality-of-life feature. Recon prompt in §D.6.

---

#### D.3 #11 — Consent gated at emit site

**Track 1 reference:** §B.8 (TCF v2.2 publisher role, consent gates at
collection)

**Pattern:** Consent must be checked at emit time, not at the reader.
The TC string (Track 1 §B.8) is the wire-format that publishers honor
before any vendor data flows.

**Status: ✅ Covered**

**Vårt:**

- `app/_lib/analytics/pipeline/runtime/loader.ts:235` —
  `consent.analytics === true` gate evaluated client-side before
  worker even starts.
- `app/_lib/analytics/pipeline/runtime/consent-banner.ts:114` — on
  consent withdrawal (`choice.analytics === false`), session
  storage keys cleared (`clearSessionStorageKeys`), salt-rotation
  triggered.
- `app/_lib/analytics/pipeline/runtime/loader-context.ts:137-143` —
  `getOrCreateVisitorId()` only runs when consent.analytics is
  granted. Visitor IDs never written to localStorage without
  consent.
- `app/_lib/analytics/pipeline/runtime/loader-context.ts:386-395` —
  consent gate documented at the source level.

**Notes:** Server-side, the `/api/analytics/collect` endpoint also
respects consent — events arriving without proper consent context
are rejected. Two-layer consent enforcement (client AND server) is
defense-in-depth, exactly the TCF design intent.

---

#### D.3 #12 — Salt-rotation / crypto-shredding

**Track 1 reference:** §B.8 (EDPB pseudonymisation guidelines: rotated
salt = mätningsavbrott = de facto anonymization, IF previous salt
destroyed)

**Status: ⚠️ Partial**

**Vårt:**

- `app/_lib/analytics/pipeline/tenant-settings.ts` —
  `generateAnalyticsSalt()` and `getAnalyticsSalt()` exist.
- `app/api/webhooks/clerk/route.ts:68` — salt minted at tenant
  creation via `generateAnalyticsSalt()`.
- `scripts/seed-test-tenant.ts:24` and `scripts/sync-clerk-org.ts:23`
  — same minting in dev seed.
- `app/_lib/analytics/pipeline/schemas/_storefront-context.ts:60-63`
  documents target behavior: *"Rotation: when an operator rotates
  Tenant.settings.analyticsSalt (out-of-band action), all subsequent
  emits produce new hashes."*

**Gap:**

- No rotation API or admin UI. Operator must manually update
  `Tenant.settings.analyticsSalt` via direct DB write.
- No audit-log capture of salt rotation (per Track 1 §B.8 spec
  question: *"is the rotation distinguishable in audit logs?"*).
- No automated cron-based rotation policy (e.g. annual rotation as
  defense-in-depth).
- No pre-rotation salt destruction step — current architecture
  doesn't physically destroy the old salt anywhere.

**Priority: Tier 2** — required for full GDPR-grade pseudonymization
but not a launch blocker. Recon prompt in §D.7 (out of scope —
follow-up).

---

#### D.3 #13 — Geo-lookup consent-gated, city-level

**Track 1 reference:** §B.8 (TCF v2.2: vendors must respect consent;
GDPR Recital 26 on identifiability — city-level aggregated data is
typically not personal data, but lat/lng can be)

**Status: ✅ Covered**

**Vårt:**

Per `admin/CLAUDE.md` "MaxMind GeoLite2 city-level geo enrichment
(consent-gated)" and verified at:

- `app/api/analytics/collect/route.ts` (consent-gating at the collect
  endpoint).
- `app/_lib/analytics/pipeline/geo.ts` — geo lookup helper.
- `app/_lib/analytics/pipeline/schemas/_storefront-context.ts` —
  `context.geo: { country, city }` shape per `_audit/analytics-phase5a-aggregator-recon.md`
  §2.10 "city-level only — exact lat/lng never enters the pipeline."

**Notes:** Track 1 §B.8 names city-level as "aggregated tillräckligt
för att inte räknas som PII under GDPR (rekital 26)". Bedfront's
implementation matches the privacy-engineering best practice.

---

### D.4 Observability + SLOs

#### D.4 #14 — Per-event SLI true/false/null

**Track 1 reference:** §B.10 (Honeycomb event-based SLO model)

**Pattern:** Honeycomb (§B.10 verbatim search summary): *"event-based
SLOs evaluate each event to true/false/null"* (goal met / goal not
met / not applicable). Distinguishes from metric-based SLOs that
aggregate over windows.

**Status: ❌ Gap**

**Vårt:**

- `app/_lib/observability/sentry.ts:1-9` — `setSentryTenantContext()`
  sets tenant tag.
- `app/_lib/analytics/pipeline/observability.ts:49-66` —
  `analyticsBreadcrumb()` emits Sentry breadcrumbs.
- `app/_lib/analytics/pipeline/observability.ts:77-128` —
  `analyticsSpan()` wraps operations in Sentry spans.
- `app/_lib/observability/inngest-sentry.ts:59-82` — `withSentry()`
  wraps Inngest steps in `step.run` + Sentry span.

**Gap:** Sentry breadcrumbs/spans are about TRACING (where did the
error come from), not SLI (did this specific request meet the
service-level objective). Per Track 1 §B.10, Honeycomb-style SLOs
require evaluating each event/request against the SLO criteria and
emitting true/false/null. We do not do this anywhere.

**Concrete example:** the aggregator's freshness SLO is 15 minutes
(per `docs/analytics/tiers.md:38`, Tier 2). A single aggregator run
that completed in 12 minutes after the cron tick = SLI true. A run
that was delayed 18 minutes = SLI false. We don't currently emit
this signal.

**Priority: Tier 1 (#2)** — bundled with #15 below in recon §D.2.

---

#### D.4 #15 — Explicit SLOs with error budgets

**Track 1 reference:** §B.10 (event-based SLOs); §B.1 (Shopify's
tiered services taxonomy with SLO targets)

**Status: ⚠️ Partial**

**Vårt:**

- `docs/analytics/tiers.md:13-69` — four tier definitions (Tier 1
  through Tier 4) with explicit numeric SLO targets:
  - Tier 1: 99.95% uptime, 5 min freshness, p99 < 200 ms
  - Tier 2: 99.9% uptime, 15 min freshness, p95 < 500 ms
  - Tier 3: 99.5% uptime, 1 hr freshness, p95 < 2 s
  - Tier 4: no SLO
- `app/_lib/analytics/pipeline/tiers.ts` — TypeScript enum + interface
  exists (cited in tiers.md:87).

**Gap:**

- Per `docs/analytics/tiers.md:8-11` (verbatim): *"We deliberately do
  not ship a service-name → tier registry constant in code yet. The
  canonical service names are defined as Phase 1+ services land
  (drainer, aggregator, query service, …)."* — service-name → tier
  mapping is missing. Phase 5A landed three services (scanner,
  aggregator, drainer) without registering tier classifications.
- No alert-rule wiring (Sentry, Datadog, Honeycomb, or in-app). The
  SLO numbers are documented but nothing fires when they breach.
- No error-budget tracking. We don't burn-rate alert.

**Priority: Tier 1 (#2)** — every external pattern (§B.1, §B.10)
requires this for production.

---

#### D.4 #16 — Schema-drift at value level

**Track 1 reference:** §B.10 (data-pipeline observability monitors
schema/value-distribution drift via cardinality, null rate, statistical
deviation)

**Status: ❌ Gap**

**Vårt:**

- Structural validation: Zod schemas at emit + drain (D.1 #1 above).
- `app/_lib/analytics/pipeline/schemas/validator-parity.test.ts` —
  parity test detects worker-vs-Zod drift.

**Gap:** No value-distribution monitoring. Per Track 1 §B.10:

- Cardinality drift (e.g. suddenly 1000× more distinct cart_ids per
  day = signals fraud or a bug).
- Null-rate drift (e.g. visitor_id starts being null in 50% of
  events overnight = signals consent banner regression).
- Mean/median drift on numeric fields (e.g. average cart_total drops
  90% = signals a currency-conversion bug).

This is canonical analytics-pipeline observability per §B.10. We
don't have it.

**Priority: Tier 2** — important but not a launch blocker. Sampling +
distribution-check job, runs nightly, flags anomalies. Recon prompt
out of scope for Tier 1 list.

---

#### D.4 #17 — End-to-end tracing

**Track 1 reference:** §B.1 (Shopify's tiered SLO discipline implies
tracing across emit → drain → aggregate)

**Status: ⚠️ Partial**

**Vårt:**

- `app/_lib/analytics/pipeline/schemas/base.ts:55-64` —
  `correlation_id` field defined: *"When set, must be a ULID.
  Set by the emit-site when an event is part of a logical user-action
  chain that produces a downstream event of a different type."*
- `app/_lib/analytics/pipeline/emitter.ts:172` — emitter accepts
  correlation_id and propagates it through the outbox.
- `inngest/functions/drain-analytics-outbox.ts:197, 230` — drainer
  preserves correlation_id from outbox row to analytics.event.
- Sentry spans (D.4 #14 above) provide partial tracing.

**Gap:**

- correlation_id is **opt-in** per emit-site. Storefront events
  (page_viewed, cart_started) do not currently propagate
  correlation_id end-to-end.
- No trace-id auto-injection at the collect endpoint.
- No tracing dashboard that can answer "this metric value is wrong;
  show me the upstream events that produced it." Phase 5A
  aggregator's `dimensionValueFrom` callbacks are deterministic, but
  there's no operational link from a daily_metric row back to the
  analytics.event rows that produced it.

**Priority: Tier 2** — important for incident response but not a
launch blocker. Phase 5A deferred this explicitly per
`_audit/analytics-phase5a-aggregator-recon.md`.

---

### D.5 Scalability + cost

#### D.5 #18 — Tiered storage with explicit retention windows

**Track 1 reference:** §B.6 (Druid rollup: pre-aggregate at ingest
to defer hot-tier storage); §B.12 (BigQuery active vs long-term
storage; Shopify cold-tier inferred)

**Status: ⚠️ Partial**

**Vårt:**

- `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:47`
  — `analytics.event` is partitioned by `RANGE(occurred_at)` —
  monthly partitions enable physical tiering by date.
- `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql:51-69`
  — 7 monthly partitions created (2026_04 through 2026_10) plus
  default partition.
- `prisma/schema.prisma:5662` — `dataRetentionDays Int @default(730)`
  on AnalyticsPipelineTenantConfig — per-tenant retention window
  field exists. Default 730 days (2 years).

**Gap (foundation migration explicitly acknowledges this — lines
19-24):** *"Out of scope — Phase 9 (Reliability):*
*A scheduled job that creates future monthly partitions ahead of
time. For now we ship 7 months of partitions plus a `event_default`
DEFAULT partition as the safety net.*
*Partition pruning / retention drop based on
tenant_config.data_retention_days."*

Concrete consequences:

1. After 2026-10-31, new events land in `event_default` (the
   safety-net partition), which the migration says *"should never
   carry rows in steady state"* (line 67). This will silently
   regress query performance because plan won't prune the default
   partition.
2. `dataRetentionDays` field has no enforcement. Old events
   accumulate forever.
3. No tiered cold storage strategy (BigQuery long-term, S3
   Glacier). At fleet scale, this is the dominant cost driver per
   Track 1 §B.12 (~$5-8M/year storage projection at 10K tenants).

**Priority: Tier 1 (#1)** — partition lifecycle automation. Recon
prompt in §D.1.

---

#### D.5 #19 — Pre-aggregation defers OLAP-DB decision

**Track 1 reference:** §B.1 (Shopify exploration data models —
*"single flat tables aggregated to a lowest domain dimension grain
and time attribute"*); §B.6 (Druid rollup at ingest; Cloudflare's
ClickHouse case study shows when raw-event scans become
unsustainable)

**Status: ✅ Covered**

**Vårt:**

- `prisma/migrations/20260504144722_analytics_phase5a_aggregator/migration.sql:1-54`
  — `analytics.daily_metric` table: pre-aggregated rows with grain
  `(tenant_id, date, metric, dimension, dimension_value)`. Exactly
  Shopify's exploration-data-model shape per Track 1 §B.1.
- `app/_lib/analytics/aggregation/aggregate-day.ts` — pure-compute
  fold engine over event stream.
- `app/_lib/analytics/aggregation/aggregate-day-runner.ts` —
  cursor-based event reader (§B.6 streaming pattern), batched
  upsert to daily_metric.
- `docs/analytics/aggregator.md:8-61` — runbook documents the
  decision explicitly: *"Phase 5A aggregator reads from the new
  analytics.event outbox and writes pre-aggregated rows to a new
  analytics.daily_metric table."*

**Notes:** The "graduation criterion" per Track 1 §B.6 (when does
Postgres-with-pre-aggregation stop being enough?) is mentioned in
the recon (§6.6 storage projection ~55 GB/year for daily_metric at
10k tenants). Adequate through ~2 years of growth before
RANGE-partitioning on date is needed for daily_metric itself.

---

#### D.5 #20 — Pre-aggregation covers dashboard reads

**Track 1 reference:** §B.1 (Shopify ShopifyQL hits exploration data
models, not raw events)

**Status: ✅ Covered**

**Vårt:**

- `app/api/analytics/dashboard/route.ts:9` — verbatim:
  *"Reads ONLY from AnalyticsDailyMetric — never from
  AnalyticsEvent or Order."* This is exactly the Track 1 §B.1
  pattern.
- `app/api/analytics/dashboard/route.ts:53-59` — single
  `prisma.analyticsDailyMetric.findMany()` call, filtered by
  tenantId + date range. No raw-event scans.
- `app/api/analytics/dashboard/route.ts:1` — `force-dynamic` on the
  route ensures fresh reads (Tier 2 freshness SLO).

**Notes:** Dashboard currently reads LEGACY `AnalyticsDailyMetric`,
not the new `analytics.daily_metric` (Phase 5A v2). Phase 5B will
flip the source after 30+ days of parity validation. The pattern
is identical — no architectural change needed to support v2 reads.

---

#### D.5 #21 — Cost model 1×/10×/100× scale

**Track 1 reference:** §B.12 (BigQuery $20/TB-month active, $10/TB
long-term; Snowflake $40/TB on-demand; back-of-envelope 4.4 trillion
events/year fleet-wide implies cold-tier required)

**Status: ❌ Gap**

**Vårt:**

- `_audit/analytics-phase5a-aggregator-recon.md` §6.6 — back-of-
  envelope storage estimate for daily_metric at 10k tenants:
  ~365M rows/year fleet-wide, ~55 GB/year inkl index.

**Gap:**

- No cost projection at the raw `analytics.event` layer. Per
  Track 1 §B.12 inferred: 1.2M events/day/tenant × 10K tenants × 365
  days × ~500 bytes = ~2.2 PB/year. Hot Postgres storage at
  $0.20-$0.30/GB-month would cost $5-8M/year — clearly prohibitive.
- No defined cold-tier strategy (BigQuery long-term, S3 Glacier,
  raw-event drop after N months).
- No per-tenant cost projection. CLAUDE.md targets 10k tenants but
  no documented unit-economics at that scale.
- No 1×/10×/100× scenario modeling.

**Priority: Tier 2** — important for fundraising / pricing but not a
launch blocker for Apelviken (single tenant). Becomes critical at
~10 tenants when raw-event volume crosses the 50 GB/month threshold
where Postgres storage cost matters.

---

### D.6 Multi-tenant isolation

#### D.6 #22 — SaaS Lens silo/pool/bridge classification

**Track 1 reference:** §B.11 (AWS SaaS Lens — silo / pool / bridge
canonical taxonomy)

**Pattern:** Per AWS SaaS Lens (§B.11 verbatim): *"these patterns fall
into one of three categories—silo, bridge, and pool."* Each service
should have an explicit classification documented.

**Status: ❌ Gap**

**Vårt:**

- Implementation IS pool/row-based per code:
  `verify-phase5a-aggregator.ts` check #10 enforces literal
  `tenant_id =` in WHERE on every analytics.event query. All
  analytics tables (analytics.event, analytics.outbox,
  analytics.daily_metric) are shared with tenant_id columns.
- `admin/CLAUDE.md` describes shared-tables-with-tenant_id pattern
  generally but does not invoke the AWS SaaS Lens taxonomy.

**Gap:** No formal classification document per service. We have:

- analytics.event: pool model (verified by code)
- analytics.outbox: pool model
- analytics.daily_metric: pool model

But no explicit doc that says "we chose pool for analytics; PMS
reliability is also pool; we will move tenant X to silo if Y
condition is met."

**Priority: Tier 2** — documentation gap, not a runtime gap. The
audit-discipline value is in the **decision criteria** for when a
high-tier tenant should get a dedicated Inngest concurrency budget
(bridge pattern per §B.11) rather than the implementation itself.

---

#### D.6 #23 — Row-based-with-tenant_id at our scale

**Track 1 reference:** §B.11 (Citus 12: schema-based 1-10K tenants /
row-based 100K-1M+; Marco Slot, July 2023)

**Status: ✅ Covered**

**Vårt:**

- Architecture: row-based with `tenant_id` column on every
  analytics table.
- Target scale per `admin/CLAUDE.md`: 10,000 active tenants.
- Per Track 1 §B.11 verbatim Citus quote: *"If you have a very large
  number of small tenants (B2C) and want to simplify schema
  management and cross-tenant queries, then row-based sharding is
  likely to be a better fit."* — Bedfront fits this pattern (B2C
  side: 10k bookings tenants ≈ Citus's row-based sweet spot at the
  lower end).

**Notes:** At 10k tenants we sit on the boundary between Citus's
"schema-based" and "row-based" sweet spots (1-10k vs 100K+). Our
choice is right for the trajectory (we want cross-tenant analytics
for fleet-level operational insights), but we should monitor query
performance per-tenant as count grows past 1k active.

---

#### D.6 #24 — Every query has literal tenant_id

**Track 1 reference:** §B.11 (Citus row-based requires `tenant_id` in
all filters; Bedfront verifier check)

**Status: ✅ Covered**

**Vårt:**

- `scripts/verify-phase5a-aggregator.ts` check #10 — verbatim from
  the script: *"every analytics.event query in aggregator code has
  tenant_id = literal in WHERE"*. CI-enforced.
- Confirmed at 17/17 in latest verifier run.
- `app/_lib/analytics/aggregation/aggregate-day-runner.ts:73-76,
  90-103` — both event-stream queries have `tenant_id =
  ${tenantId}` literal.
- The scanner's DISTINCT-tenant query is the documented exception
  (per check #10 docstring: *"scan-analytics-aggregate's
  DISTINCT-tenant query is NOT tenant-scoped by definition (it must
  enumerate ALL active tenants)"*).

**Notes:** Static-check enforcement is stronger than convention.
Match Snowplow's parity-test pattern of mechanical drift detection.

---

### D.7 Data quality

#### D.7 #25 — Schema validates but values diverge

**Track 1 reference:** §B.10 (data-quality observability: drift in
mean/median/cardinality/null-rate beyond schema)

**Status: ❌ Gap**

**Vårt:**

- Structural validation: D.1 #1, D.1 #4 above.

**Gap:** Same as D.4 #16. Schema-validating events that have
problematic values (e.g. `payment_succeeded.amount = 1` in öre when
the merchant only sells > 100 SEK products) are accepted today.
There is no value-distribution baseline or drift detection.

**Priority: Tier 2** — see D.4 #16. Same fix.

---

#### D.7 #26 — Sampling + bias-of-omission accounted for

**Track 1 reference:** §B.10 (consent-driven sampling produces
implicit bias in analytics)

**Status: ⚠️ Partial**

**Vårt:**

- `docs/analytics/aggregator.md` "Same-day approximation" section
  documents one source of bias explicitly: cart_started on day N,
  checkout on day N+1 inflates today's CART_TO_CHECKOUT_RATE. The
  doc says: *"Aggregator does NOT clamp — saturation would hide
  cross-day carryover and produce subtly wrong trends."* — i.e.
  bias is acknowledged and not hidden.
- `app/_lib/analytics/pipeline/schemas/_storefront-context.ts:148-151`
  documents consent-driven absence of visitor_id: *"Consent: the
  loader writes/reads visitor_id ONLY when consent.analytics ===
  true. Without consent the field is omitted from the emit."*

**Gap:** The consent-driven sampling implication for funnel-rates
isn't documented anywhere. Concretely: if 80% of guests deny
consent, the funnel rates we compute are over the consenting 20%,
which may be a biased sample (e.g. cookie-blocking users skew toward
power-shoppers or privacy-conscious cohorts). Track 1 §B.10
flags this as a canonical bias in consent-gated pipelines.

**Priority: Tier 3** — analytical caveat to document, not a runtime
bug. Add to aggregator.md.

---

### D.8 Disaster recovery

#### D.8 #27 — DR runbook tested

**Track 1 reference:** §B.1 (Shopify tiered reliability discipline);
Bedfront's PMS reliability DR runbook as in-house exemplar

**Pattern:** Bedfront's PMS reliability already follows this
discipline:

- `docs/runbooks/pms-reliability-dr.md` — full DR runbook
- `scripts/pms-reliability/{export.ts,import.ts,verify.ts}` — JSONL
  export/import/verify tooling per the recon doc

**Status: ❌ Gap**

**Vårt:**

- For analytics: nothing equivalent. No `docs/runbooks/analytics-dr.md`.
  No `scripts/analytics/{export,import,verify}.ts`.
- `docs/analytics/aggregator.md` covers operational procedures for
  the aggregator (manual fanout trigger, ad-hoc parity check) but
  not DR scenarios:
  - "Inngest down for 24h — how do we backfill?"
  - "Postgres outage — what's our restore RTO/RPO?"
  - "Tenant X requests data export per GDPR — how?"
  - "Migration to BigQuery cold tier — what's the process?"

**Priority: Tier 1 (#5)** — DR is a Shopify-grade table-stakes
property. Recon prompt in §D.5.

---

#### D.8 #28 — Aggregator outputs idempotent under re-run

**Track 1 reference:** §B.6 (Druid perfect-rollup is idempotent);
§B.7 (composite-unique upsert achieves outbox idempotence)

**Status: ✅ Covered**

**Vårt:**

- `prisma/migrations/20260504144722_analytics_phase5a_aggregator/migration.sql:35-39`
  — `CREATE UNIQUE INDEX
  daily_metric_tenant_id_date_metric_dimension_dimension_valu_key
  ON analytics.daily_metric (tenant_id, date, metric, dimension,
  dimension_value)`.
- `app/_lib/analytics/aggregation/aggregate-day-runner.ts:` —
  `upsertRow()` uses Prisma's upsert with the composite-unique key
  in `where.tenantId_date_metric_dimension_dimensionValue`.
- `app/_lib/analytics/aggregation/aggregate-day-runner.test.ts` —
  test file contains the literal string "idempotency" (verifier
  check #6 enforces existence). Test runs `runAggregateDay` twice
  on identical data and asserts identical final daily_metric store
  state.
- `_audit/analytics-phase5a-aggregator-recon.md` §6.7 covers this
  invariant explicitly.

**Notes:** Backfill is a matter of re-running the aggregator over
the affected window. No custom one-shot job needed. Matches Druid's
perfect-rollup idempotence per Track 1 §B.6.

---

## C. Prioriterad roadmap

### Tier 1 — Production blockers (must ship before Apelviken go-live, October 2026)

#### Tier 1 #1 — Partition lifecycle automation på `analytics.event`

**Problem:** Foundation migration creates 7 monthly partitions
(2026_04 through 2026_10) and a default safety-net partition. Once
2026-10-31 passes, new events land in `event_default` which the
migration explicitly says *"should never carry rows in steady
state"* (line 67). No drop-old-partitions GC enforces
`tenant_config.data_retention_days`.

**Failure mode:** Two cliff-edges:

1. **Partition exhaustion (~Nov 2026):** All new analytics.event
   rows land in `event_default`. Plan can't prune by date. Sequential
   scan over default partition. Aggregator query latency degrades
   sharply. Tier 2 freshness SLO breaches.
2. **Storage growth:** At 1.2M events/day/tenant × 10k tenants,
   table grows ~440B rows/year. Without partition drop based on
   `dataRetentionDays`, storage becomes prohibitive past ~24 months.

**Scope:** ~250 LOC.

- New cron `/api/cron/analytics-partition-maintenance` (~120 LOC).
- Helper: `app/_lib/analytics/pipeline/partition-maintenance.ts`
  with `createNextPartition()` and `dropExpiredPartitions()`.
- Tests against a real Postgres dev DB.
- Verify-script extension (~30 LOC).

**Strategi:** Native Postgres declarative partitioning by
`RANGE(occurred_at)`, monthly partitions. New partition created 2
months ahead by cron (defense-in-depth: skip a month, still safe).
Old partitions DETACHED + dropped automatically per
`tenant_config.data_retention_days` — if at least one tenant retains
them, partition is kept. Drop only when ALL tenants' retention
windows have passed.

**Reference:** Track 1 §B.6 (Druid segment-based architecture, cold
storage tiers); industry-standard for Postgres analytics tables
(TimescaleDB, Citus). The fix matches Phase 0 migration's
documented Phase-9 plan.

#### Tier 1 #2 — SLO alerting för aggregator/drainer/outbox

**Problem:** `docs/analytics/tiers.md` defines tier SLOs but
`app/_lib/analytics/pipeline/tiers.ts` has no service-name → tier
mapping. No alert rules wired (Sentry/Datadog/Honeycomb/in-app).
No error-budget tracking. We have Sentry breadcrumbs and spans
(`app/_lib/analytics/pipeline/observability.ts`) but those are for
TRACING, not SLI evaluation per Track 1 §B.10.

**Failure mode:** When the aggregator falls behind (e.g. Inngest
plan-cap exceeded during BFCM-equivalent), nobody is paged. Tier 2
freshness SLO of 15 minutes is breached for hours before someone
notices via dashboard staleness.

**Scope:** ~400 LOC.

- Service-tier registry in `app/_lib/analytics/pipeline/tiers.ts`
  (~80 LOC) — maps each service ID to tier.
- SLI evaluation helper in
  `app/_lib/analytics/pipeline/sli.ts` (~150 LOC) — emits true/
  false/null per request per Honeycomb pattern. Wires into Sentry
  metrics + structured logs.
- Alert rules wired (Sentry alert config or external) — depends on
  alerting platform choice (~100 LOC + config).
- Verifier extension (~30 LOC).
- Integration in drainer/aggregator hot paths (~40 LOC).

**Strategi:** Per Track 1 §B.10 + §B.1:

1. Define per-service SLI: e.g. drainer freshness SLI =
   `now() - outbox.created_at` for the oldest pending row.
2. Define per-service SLO target from
   `docs/analytics/tiers.md` per Tier 2 (15 min freshness, p95 < 500
   ms).
3. Emit SLI true/false/null on every cron tick (Honeycomb pattern).
4. Burn-rate alert when error budget drops below 50% in any
   30-minute window.
5. Page on-call during business hours (Tier 2).

**Reference:** Track 1 §B.10 (Honeycomb event-based SLOs); §B.1
(Shopify's tiered service taxonomy with explicit SLO targets).

#### Tier 1 #3 — Pipeline-health endpoint + admin dashboard

**Problem:** PMS reliability has
`/api/admin/pms-reliability/health/route.ts` (referenced in
`admin/CLAUDE.md` PMS observability section). Analytics has
nothing equivalent. No way for an operator to see at a glance
whether the analytics pipeline is healthy.

**Failure mode:** Operator-side blindness. When a tenant complains
"my dashboard is showing yesterday's data", an operator has to
SSH-equivalent into Inngest dashboard, Postgres, and grep
production logs to triage. Mean-time-to-resolution suffers.

**Scope:** ~350 LOC.

- New endpoint `app/api/admin/analytics-pipeline/health/route.ts`
  (~150 LOC) — returns JSON with: outbox backlog (per tenant + per
  age bucket), DLQ rows, last aggregator run age per tenant,
  aggregator failure count last hour, partition status.
- Admin UI page `app/(admin)/analytics-pipeline/health/page.tsx`
  (~150 LOC) — renders the JSON as charts/tables. Refreshes every
  60s.
- CRON_SECRET-protected variant for external monitoring polling
  (~30 LOC).
- Verifier extension (~20 LOC).

**Strategi:** Mirror PMS reliability health endpoint shape. Same
auth pattern (CRON_SECRET for machine, Clerk admin session for UI).
Per Track 1 §B.10 alert categories: backlog, freshness, error
counts, stranded operations.

**Reference:** PMS reliability internal exemplar; Track 1 §B.10
canonical observability domains (freshness/volume/schema/value
drift).

#### Tier 1 #4 — Failed-events table + admin UI för DLQ triage

**Problem:** DLQ pattern IS implemented at the outbox-row level
(`failed_count++` + `[DLQ]` marker + `scripts/replay-dlq.ts`) but
Snowplow's "non-lossy pipeline with separate failed-events table"
pattern (Track 1 §B.2) is not. The `[DLQ]` marker conflates
"still queued" with "permanently failed" rows in the same physical
table. No admin UI to inspect DLQ rows from the browser.

**Failure mode:**

1. Triage: developer must SSH-equivalent and run `tsx
   scripts/replay-dlq.ts` from a local machine.
2. Discoverability: there's no aggregate view of "what's in DLQ
   right now, grouped by failure category".
3. Per Track 1 §B.2: Snowplow distinguishes 4 failure categories
   (Collection / Validation / Enrichment / Loading). Bedfront's
   `[DLQ]` marker doesn't categorize.

**Scope:** ~600 LOC.

- New table `analytics.failed_events`:
  ```sql
  CREATE TABLE analytics.failed_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    original_outbox_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_name TEXT,
    schema_version TEXT,
    failure_category TEXT NOT NULL,  -- 'validation' | 'insert' | 'enrichment' | 'collection'
    error_type TEXT NOT NULL,
    error_message TEXT,
    raw_payload JSONB,
    failed_count INT,
    failed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    replayed_at TIMESTAMP,
    replayed_by TEXT
  );
  ```
- Migration (~80 LOC).
- Schema model addition + migration (~40 LOC).
- Drainer modification: when `failed_count > threshold`, INSERT
  into `analytics.failed_events` BEFORE marking the outbox row
  with `[DLQ]` (~80 LOC).
- Admin UI `app/(admin)/analytics-pipeline/failed-events/page.tsx`
  — list, filter by category, replay individual rows (~250 LOC).
- Replay action: `app/_lib/analytics/pipeline/replay-failed-event.ts`
  (~80 LOC).
- Verifier extension (~30 LOC).
- Tests (~40 LOC).

**Strategi:** Per Track 1 §B.2 verbatim: *"Failed events are NOT
written to your atomic events table, which only contains high
quality data."* Same discipline. Replay gets explicit audit trail
(`replayed_at`, `replayed_by`). The existing
`scripts/replay-dlq.ts` becomes the operator-facing alternative,
admin UI becomes the standard path.

**Reference:** Track 1 §B.2 (Snowplow good/bad event pattern).

#### Tier 1 #5 — DR-runbook + JSONL-export-tooling för analytics

**Problem:** No `docs/runbooks/analytics-dr.md`. No
`scripts/analytics/{export,import,verify}.ts`. PMS reliability has
both (`docs/runbooks/pms-reliability-dr.md`,
`scripts/pms-reliability/{export,import,verify}.ts`).

**Failure mode:** Operator-side. When (not if) the analytics
pipeline experiences a DR scenario:

1. "Inngest down for 8h" — what's our backfill procedure? (Today: no
   document.)
2. "Postgres data corruption in `analytics.event`" — RTO? RPO?
   (Today: no document.)
3. "Tenant X requests full data export per GDPR Article 20" — how?
   (Today: no document.)
4. "Migration to BigQuery cold tier" — what's the test procedure?
   (Today: no document.)

**Scope:** ~700 LOC + ~250 LOC docs.

- `docs/runbooks/analytics-dr.md` (~400 lines, mirrors
  pms-reliability-dr.md structure):
  - Scenario tree (Inngest down, Postgres data corruption, tenant-
    specific rollback, BigQuery migration).
  - RTO/RPO targets per scenario.
  - JSONL export/import procedures.
  - Test drill schedule.
- `scripts/analytics/export.ts` (~250 LOC) — streams analytics.event
  + analytics.outbox + analytics.daily_metric to JSONL.
- `scripts/analytics/import.ts` (~250 LOC) — restores from JSONL,
  --dry-run + --overwrite + --tenantId-filter modes.
- `scripts/analytics/verify.ts` (~150 LOC) — round-trip integrity
  check.
- npm-script registrations (~5 LOC).
- Verifier extension (~30 LOC).

**Strategi:** Mirror PMS reliability DR pattern. Per Track 1 §B.7
(SeatGeek's outbox pattern), the pipeline state IS portable:
analytics.event + analytics.outbox + analytics.daily_metric +
analytics.tenant_config = 100% of the analytics state. JSONL
export of those four tables is the disaster artifact.

**Reference:** Bedfront PMS reliability DR runbook in-house exemplar;
Track 1 §B.7 (outbox pattern's portable state).

#### Tier 1 #6 — GDPR RTBF flow för analytics events

**Problem:** Track 1 §B.8 verbatim: GDPR Recital 26 says
pseudonymized data *"should be considered to be information on an
identifiable natural person"* — i.e. still subject to GDPR. Bedfront
has no flow to delete analytics events for a specific GuestAccount
or to handle tenant deletion's analytics-side purge.

**Failure mode:**

1. **Regulatory:** Guest exercises Article 17 right to erasure.
   Bedfront has no procedure to find and delete their analytics
   events. Compliance failure.
2. **Operational:** Tenant deletion (Clerk webhook `org.deleted`)
   leaves analytics events orphaned in analytics.event indefinitely.
3. **Privacy by design:** Per `_storefront-context.ts:60-63`, salt
   rotation is documented but unimplemented (D.3 #12 Partial). No
   "wipe my history" mechanism.

**Scope:** ~550 LOC.

- New endpoint `app/api/admin/analytics/erase`:
  - POST `{ tenantId, actorId? }` deletes analytics events for
    `(tenantId, actor_id = ?)`. If no actorId, deletes the entire
    tenant's analytics events.
  - Returns a job ID. Job runs async via Inngest (large delete sets
    can take minutes).
- `app/_lib/analytics/pipeline/rtbf.ts` (~250 LOC):
  - `enumerateActorIdsForGuestAccount()` — walks all events with
    matching `actor_id` patterns.
  - `eraseEventsForActor(tenantId, actorId)` — deletes from
    analytics.event AND analytics.outbox (both layers).
  - Audit-log capture (Sentry breadcrumb + structured log).
- Inngest job `inngest/functions/erase-analytics-events.ts` (~100
  LOC) — concurrency-keyed by tenantId.
- Integration with Clerk `org.deleted` webhook
  (`app/api/webhooks/clerk/route.ts`) — fires erase for the deleted
  tenant.
- Salt rotation API as part of the same module (~80 LOC) — out-of-
  band rotation produces the "wipe my history" behavior per
  `_storefront-context.ts:60-63`.
- Tests (~120 LOC).
- Verifier extension (~30 LOC).

**Strategi:** Per Track 1 §B.8:

1. RTBF for the entire tenant: hard-delete all rows where
   `tenant_id = X`. Acceptable because tenant is gone; no future
   analytics value.
2. RTBF for a specific GuestAccount: hard-delete rows where
   `tenant_id = X AND actor_id = Y`. Audit-log captures
   (operator_user_id, deletion_reason, row_count, timestamp).
3. Salt rotation as crypto-shred: rotate salt; old hashes become
   de facto anonymous because the original input (UA string) was
   never stored — only the hash. Rotation makes pre-rotation data
   non-correlatable with post-rotation data.

**Reference:** Track 1 §B.8 (GDPR Recital 26 verbatim;
EDPB pseudonymisation guidelines).

---

### Tier 2 — Operational risks (within 90 days post-launch)

#### Tier 2 #7 — Salt rotation API + audit log

**Problem:** D.3 #12 Partial. Per
`_storefront-context.ts:60-63`, rotation is target behavior but
unimplemented. Operator must hand-edit Tenant.settings JSON to
rotate.

**Scope:** ~200 LOC. Bundled with Tier 1 #6 if shipped together.

#### Tier 2 #8 — Value-distribution drift detection

**Problem:** D.4 #16 + D.7 #25 Gap. Schema-validating events with
problematic values are accepted today.

**Scope:** ~400 LOC. Nightly cron that samples last-N-day events,
computes per-event-type histograms (mean, p50, p99, null-rate,
cardinality), compares to learned baseline, flags anomalies.

**Reference:** Track 1 §B.10 (canonical drift dimensions).

#### Tier 2 #9 — End-to-end correlation_id tracing

**Problem:** D.4 #17 Partial. correlation_id is opt-in per emit-site;
no auto-injection at the collect endpoint; no tracing dashboard.

**Scope:** ~250 LOC. Auto-inject correlation_id at the collect
endpoint; pass through aggregator's metric-row-to-source-event
mapping for incident response.

**Reference:** Track 1 §B.1 (Shopify's tiered SLO discipline implies
end-to-end traceability).

#### Tier 2 #10 — Cost projection at 1×/10×/100× scale

**Problem:** D.5 #21 Gap. No documented unit-economics at 10k
tenants.

**Scope:** ~400 LINES of doc + spreadsheet model. Not code.

- Section in `docs/analytics/aggregator.md` covering raw-event
  storage cost projections at 1×/10×/100×.
- Cold-tier strategy decision (when to drop raw events / migrate
  to BigQuery).
- Per-tenant cost-of-goods-sold contribution from analytics.

**Reference:** Track 1 §B.12 (BigQuery $20/TB-month;
Snowflake $40/TB-month; Shopify implied cold-tier strategy).

#### Tier 2 #11 — SaaS Lens classification document

**Problem:** D.6 #22 Gap. Implementation IS pool/row-based
(verified by check #10) but no formal classification document.

**Scope:** ~80 lines of doc.

- Section in `docs/analytics/aggregator.md` documenting:
  "We chose pool/row-based for analytics. Bridge candidates: a
  high-tier tenant could get a dedicated Inngest concurrency
  budget if {criterion}. Migration to silo would be required if
  {criterion}."

**Reference:** Track 1 §B.11 (AWS SaaS Lens taxonomy).

#### Tier 2 #12 — Partition health + default-partition alarm

**Problem:** Foundation migration line 67-68 says: *"TODO(phase 5):
alert when this partition's rowcount > 0."* — never implemented.

**Scope:** ~80 LOC. Add a check to the Tier 1 #3 health endpoint:
SELECT count from event_default; if > 0, raise alert.

**Reference:** Foundation migration intent + Track 1 §B.6.

---

### Tier 3 — Mature platform (6-12 months)

#### Tier 3 #13 — SchemaVer-style versioning conversion

**Problem:** D.1 #2 Partial. We use SemVer dotted format; Snowplow's
SchemaVer hyphenated MODEL-REVISION-ADDITION is the canonical
schema-versioning standard.

**Scope:** ~120 LOC. Mechanical: add a `-` for `.` mapping in registry.
The semantics are already aligned (PATCH≈ADDITION, MINOR≈REVISION,
MAJOR≈MODEL).

**Reference:** Track 1 §B.2.

#### Tier 3 #14 — Naming-convention static check

**Problem:** D.1 #3 today relies on review discipline.

**Scope:** ~30 LOC verifier check that asserts every event_name in
the registry matches a regex of `noun_action` past-tense.

**Reference:** Track 1 §B.4.

#### Tier 3 #15 — Bias-of-omission documentation

**Problem:** D.7 #26 Partial. Funnel-rates document same-day
approximation but not consent-driven sampling bias.

**Scope:** ~30 lines of doc in `docs/analytics/aggregator.md`.

**Reference:** Track 1 §B.10.

#### Tier 3 #16 — Multi-region replication / disaster recovery hot-standby

**Problem:** Today analytics state is single-region (Neon Postgres
EU + single Inngest project). At Apelviken go-live (single tenant,
EU) this is fine. At 10k tenants targeting multi-region merchants,
recovery from a regional outage requires multi-region replication
strategy.

**Scope:** ~10k+ LOC. Whole-architecture migration. Tier 3 because
it's months of work and not blocking 10k-tenant launch — only
multi-region launch.

**Reference:** Industry-standard.

#### Tier 3 #17 — Per-tenant performance benchmarks

**Problem:** D.6 #23 Citus says row-based is fine through 100k+
tenants but we have no benchmark of query performance per-tenant
density.

**Scope:** ~150 LOC. Synthetic-load script + benchmark report.

**Reference:** Track 1 §B.11.

#### Tier 3 #18 — ML-based anomaly detection on metric values

**Problem:** D.4 #16 fix (Tier 2 #8) is histogram-based. Mature
platform applies ML for anomaly detection.

**Scope:** ~500+ LOC + ML model. Out of scope for Apelviken
go-live, candidate post-launch.

**Reference:** Track 1 §B.10 (Monte Carlo et al.).

#### Tier 3 #19 — OLAP-DB graduation criterion

**Problem:** D.5 #19 Covered today via daily_metric pre-agg, but
when Phase 5C drops legacy raw events (analytics.event becomes the
only source) and analytics use cases broaden (ad-hoc exploration,
cohort analysis, ML feature stores), Postgres-only stops being
enough.

**Scope:** ~50 LOC of decision-tree document. Then migration is
months of work when the criterion fires.

**Reference:** Track 1 §B.6 (Cloudflare's ClickHouse migration
trigger; Pinterest's Druid migration trigger).

#### Tier 3 #20 — Funnel cube design (per-product, per-channel)

**Problem:** Phase 5A funnel-metrics cover TOTAL only. Per-product
and per-channel funnel rates are deferred to future PRs (per
`docs/analytics/aggregator.md` "Out of scope" section). Mature
platform exposes these dimensions.

**Scope:** ~600 LOC. Schema bumps on cart/checkout events to carry
source_channel + line_items[] + product_id; mapping registry
extension; verifier extension.

**Reference:** Track 1 §B.6 (Druid rollup with multiple dimensions),
§B.9 (Cube.js pre-agg with partitioning).

---

## D. Recon-prompts för Tier 1-fixes

For each Tier 1 item, a standalone recon prompt that prompt-engineer
can paste to terminal-Claude for implementation-prep. Each prompt is
copy-paste-ready.

### D.1 Recon: Partition lifecycle automation på `analytics.event`

```
TASK: Recon för partition lifecycle automation av analytics.event

CONTEXT
═══════
Foundation migration 20260430145830_analytics_pipeline_foundation
created analytics.event partitioned BY RANGE(occurred_at) with 7
monthly partitions through 2026-10 plus a default safety-net partition
(line 47 + 51-69). The migration explicitly says (lines 19-24):

  "Out of scope — Phase 9 (Reliability):
   * A scheduled job that creates future monthly partitions ahead
     of time. For now we ship 7 months of partitions plus a
     `event_default` DEFAULT partition as the safety net.
   * Partition pruning / retention drop based on
     tenant_config.data_retention_days."

Track 1 external research (admin/_audit/analytics-external-research.md
§B.6) confirms this is a Phase-1 gap: industry-standard for high-volume
event tables (Cloudflare ClickHouse, TimescaleDB, Citus all assume
auto-managed partitions).

Phase 5A's analytics.daily_metric is small enough (~55 GB/year per
recon §6.6) that partitioning that table is Phase 5C territory. This
recon focuses ONLY on analytics.event.

LEVERANS
════════
Recon document at admin/_audit/analytics-partition-lifecycle-recon.md
covering:

1. Approach: declarative partitioning vs pg_partman vs application-
   level. Recommendation + rationale.

2. Cron design:
   - Schedule (suggested: monthly, mid-month for next-month creation)
   - Concurrency model (Inngest function vs Vercel cron)
   - Idempotency (re-run is safe)
   - Failure handling (partition already exists, default partition has
     rows)

3. Drop-old-partitions algorithm:
   - Per-partition: max(occurred_at) > MIN(retention_days_per_tenant)
     ? KEEP : DETACH + DROP
   - Edge case: tenant retention varies. The "minimum across all
     tenants who still have data in this partition" determines drop
     eligibility.
   - Audit trail: log every detach/drop to a new
     analytics.partition_log table.

4. Default-partition alarm:
   - Foundation migration line 67-68 anticipates this.
   - Reuse Tier 1 #3's health endpoint to surface default-partition
     rowcount.

5. Tests:
   - Migration applies cleanly.
   - Cron creates next month's partition.
   - Cron skips when partition already exists (idempotency).
   - Drop-old-partitions respects per-tenant retention.

6. Out of scope:
   - analytics.daily_metric partitioning (Phase 5C).
   - Cold-tier migration (BigQuery export — separate Tier 2 work).
   - Restore-from-detached-partition (DR runbook concern).

OUT OF SCOPE
════════════
- Code implementation. Recon-only.
- analytics.daily_metric partitioning.
- BigQuery cold-tier integration.

REFERENCES
══════════
- prisma/migrations/20260430145830_analytics_pipeline_foundation/
  migration.sql:47-69
- _audit/analytics-external-research.md §B.6 (Cloudflare),
  §B.12 (storage-cost projection)
- prisma/schema.prisma:5662 (dataRetentionDays field)
```

### D.2 Recon: SLO alerting för aggregator/drainer/outbox

```
TASK: Recon för SLO alerting på analytics-pipelinen

CONTEXT
═══════
docs/analytics/tiers.md defines 4 service tiers with explicit SLO
targets (e.g. Tier 2: 99.9% uptime, 15 min freshness, p95 < 500 ms).
app/_lib/analytics/pipeline/tiers.ts has the enum + interface but no
service-name → tier mapping.

We have Sentry observability via:
- app/_lib/observability/sentry.ts (tenant tag)
- app/_lib/analytics/pipeline/observability.ts (analyticsBreadcrumb +
  analyticsSpan)
- app/_lib/observability/inngest-sentry.ts (withSentry + captureDLQ)

These are TRACING tools, not SLI evaluation. Per Track 1
admin/_audit/analytics-external-research.md §B.10, Honeycomb's event-
based SLO model is the canonical pattern: every event evaluates to
true (goal met), false (goal not met), or null (not applicable).

There are NO alert rules wired today. SLO breach goes silent.

LEVERANS
════════
Recon document at admin/_audit/analytics-slo-alerting-recon.md
covering:

1. SLO definition per service (each Phase 5A service named in
   inngest/functions/index.ts):
   - drain-analytics-outbox: Tier 1-adjacent; SLI = drain success
     rate; SLO = 99.95%.
   - scan-analytics-aggregate: Tier 2; SLI = scan-completion-on-
     time; SLO = 99.9%.
   - run-analytics-aggregate-day: Tier 2; SLI = aggregator
     freshness ≤ 15 min; SLO = 99.9%.

2. Service-tier registry:
   - Add to app/_lib/analytics/pipeline/tiers.ts a lookup table
     mapping service-id → tier.
   - Verifier-script extension: every Inngest function registered
     in inngest/functions/index.ts MUST have a tier mapping.

3. SLI evaluation pattern:
   - Per Track 1 §B.10: emit true/false/null at each event/run.
   - For freshness SLIs: now() - max(occurred_at) → bucketize → emit
     SLI.
   - For success SLIs: did this batch process? → emit SLI.

4. Alert wiring:
   - Compare against alerting platforms: Sentry (free with our
     existing wiring), Datadog (cost vs. value), Honeycomb (best
     SLO product per §B.10).
   - Recommend Sentry-based for launch (zero new vendor), upgrade
     to Honeycomb later.
   - Alert rules: 50% error budget burn in 30-minute window pages
     Tier 2 on-call (business hours).

5. Burn-rate tracking:
   - Rolling 7-day window of SLI true/false counts per service.
   - Burn rate = (false count last 30 min / total count last 30 min)
     compared to monthly error budget.

6. Implementation phasing:
   - Phase A: SLI emission only, no alert routing (1 week).
   - Phase B: Sentry alert rules wired (1 week).
   - Phase C: error-budget tracking + burn-rate alerts (2 weeks).

7. Tests:
   - Unit tests for SLI evaluation logic.
   - Integration test: burn 10% of error budget, confirm signal
     reaches alert routing.

8. Cost: Sentry Pro/Business plan estimate at 10k tenant scale.

OUT OF SCOPE
════════════
- Honeycomb migration (Tier 3 Phase B).
- Mobile push for after-hours Tier 2 alerts (separate work).
- ML-based anomaly detection (Tier 3).

REFERENCES
══════════
- docs/analytics/tiers.md
- app/_lib/analytics/pipeline/tiers.ts
- app/_lib/analytics/pipeline/observability.ts
- _audit/analytics-external-research.md §B.10 (Honeycomb), §B.1
  (Shopify tiered services)
```

### D.3 Recon: Pipeline-health endpoint + admin dashboard

```
TASK: Recon för analytics-pipeline-health endpoint + admin UI

CONTEXT
═══════
PMS reliability has app/api/admin/pms-reliability/health/route.ts —
returns JSON aggregating per-table counts, oldest pending/dead age,
stranded operations, last cron run ages, backlog counters.
admin/CLAUDE.md cites this as "pull-based health endpoint for
external monitoring polling (recommended every minute)."

Analytics has nothing equivalent. To triage analytics-pipeline issues
today an operator must SSH-equivalent into Inngest dashboard,
Postgres, and grep production logs.

LEVERANS
════════
Recon document at admin/_audit/analytics-health-endpoint-recon.md
covering:

1. Endpoint shape:
   - app/api/admin/analytics-pipeline/health/route.ts — JSON response.
   - Auth: dual mode — Bearer CRON_SECRET for external monitoring
     polling; Clerk admin session for UI.

2. JSON shape proposal:
   {
     "tables": {
       "outbox": {
         "pending_count_per_age_bucket": {...},
         "dlq_count": N,
         "oldest_pending_age_sec": N,
         ...
       },
       "event": {
         "rows_last_24h": N,
         "default_partition_rowcount": 0,  // alert if > 0
         "current_partitions": ["event_2026_05", ...],
         "next_partition_eta": "2026-06-01"
       },
       "daily_metric": {
         "tenants_aggregated_last_15m": N,
         "rows_last_24h": N,
         "oldest_unagged_event_age_sec": N
       },
       "failed_events": {  // bundles with Tier 1 #4
         "by_category": {
           "validation": N,
           "insert": N,
           "enrichment": N,
           "collection": N
         }
       }
     },
     "crons": {
       "scan_age_sec": N,
       "drain_age_sec": N,
       "aggregator_age_sec": N
     },
     "tenants": {
       "active_last_24h": N,
       "with_dlq": N,
       "with_open_circuit": N  // future, when circuit breaker added
     }
   }

3. Admin UI:
   - app/(admin)/analytics-pipeline/health/page.tsx — auto-refresh
     every 60s.
   - Reuse existing admin UI primitives (admin/CLAUDE.md component
     reuse rules).
   - Tabs: outbox, event, daily_metric, failed_events, tenants.
   - Per-tenant drill-down: click a row, see that tenant's pipeline
     health.

4. Reuse opportunity:
   - PMS reliability health endpoint code structure (helpers, JSON
     shape conventions) — copy + adapt.
   - Match the alerting patterns in admin/CLAUDE.md "PMS reliability
     fairness + health monitoring" section.

5. Tests:
   - Endpoint returns valid JSON with all expected fields.
   - Auth enforcement — both CRON_SECRET and Clerk session.
   - UI renders with mocked data.

6. Out of scope:
   - Real-time WebSocket updates (poll-based is enough at Tier 2).
   - Per-event drill-down (correlation_id end-to-end is Tier 2 #9).

OUT OF SCOPE
════════════
- Implementation. Recon only.
- Real-time push.
- Cross-pipeline (PMS + analytics combined) view.

REFERENCES
══════════
- app/api/admin/pms-reliability/health/route.ts (in-house exemplar)
- _audit/analytics-external-research.md §B.10 (canonical
  observability metrics)
- admin/CLAUDE.md "PMS reliability fairness + health monitoring"
```

### D.4 Recon: Failed-events table + admin UI för DLQ triage

```
TASK: Recon för analytics.failed_events + DLQ admin UI

CONTEXT
═══════
DLQ pattern IS implemented at the outbox-row level (verified
2026-05-04):
- inngest/functions/drain-analytics-outbox.ts:259-277 sets
  failed_count + last_error + [DLQ] marker
- scripts/replay-dlq.ts handles manual replay
- app/_lib/observability/inngest-sentry.ts:84-110 fires Sentry with
  fingerprint ["analytics", "dlq", event_name, error_type]

Snowplow's pattern (Track 1 §B.2) goes further: separate
analytics.failed_events table with explicit failure categorization
(Collection / Validation / Enrichment / Loading), so the live outbox
table stays small and DLQ inspection is a single-table query.

Today, no admin UI to inspect/triage DLQ rows. Operator must
SSH-equivalent + run tsx scripts/replay-dlq.ts.

LEVERANS
════════
Recon document at
admin/_audit/analytics-failed-events-recon.md covering:

1. Table schema (CREATE TABLE analytics.failed_events):
   - id (PK)
   - tenant_id, original_outbox_id, event_id
   - event_name, schema_version
   - failure_category: 'validation' | 'insert' | 'enrichment' |
     'collection' (matches §B.2)
   - error_type, error_message
   - raw_payload JSONB
   - failed_count (final count when moved to this table)
   - failed_at, replayed_at, replayed_by
   - Indexes: (tenant_id, failed_at), (failure_category, failed_at)

2. Drainer modification:
   - Today: when failed_count > threshold, mark outbox row [DLQ] +
     published_at = NOW.
   - Tomorrow: when failed_count > threshold, INSERT into
     analytics.failed_events FIRST, then mark outbox [DLQ] +
     published_at. Both in the same transaction.

3. Failure-category mapping (per Snowplow §B.2):
   - 'validation': schema.parse threw (today's failure_count++ path)
   - 'insert': $executeRaw INSERT failed (DB error)
   - 'enrichment': future (not used today)
   - 'collection': failed at /api/analytics/collect (today untouched
     by drainer; would require collect-endpoint change)

4. Admin UI:
   - app/(admin)/analytics-pipeline/failed-events/page.tsx
   - List view: paginate by failed_at desc, filter by category,
     tenant, event_name.
   - Detail view: full payload, error message, action buttons:
     "Replay this event" (replays via the drainer pipeline — moves
     row back to outbox with failed_count = 0), "Discard" (keeps
     audit trail but marks as accepted-loss).
   - Bulk actions: replay all in category, etc.

5. Replay action:
   - app/_lib/analytics/pipeline/replay-failed-event.ts
   - Updates analytics.failed_events.replayed_at + replayed_by.
   - Re-INSERTs into analytics.outbox with the original event_id (tx-
     atomic with UPDATE failed_events).
   - Best-effort signalAnalyticsFlush so drainer picks it up
     immediately.

6. Migration of legacy DLQ rows:
   - One-shot migration: SELECT * FROM analytics.outbox WHERE
     last_error LIKE '[DLQ]%' → INSERT into failed_events.
   - Then DELETE those rows from outbox (now duplicated).

7. Tests:
   - Drainer puts failures into failed_events.
   - Replay action moves row back to outbox.
   - Migration moves all existing DLQ rows.
   - Admin UI renders correctly.

8. Verifier extension:
   - Check that drainer writes to failed_events (not just [DLQ]
     marker).
   - Check that admin UI exists.

OUT OF SCOPE
════════════
- Object-storage backup of failed_events (Snowplow does this; we
  defer to Tier 2 #5 DR work).
- Auto-replay on retry-cron (manual replay only for now).
- Implementation. Recon only.

REFERENCES
══════════
- inngest/functions/drain-analytics-outbox.ts:259-299
- scripts/replay-dlq.ts
- app/_lib/observability/inngest-sentry.ts:84-110
- _audit/analytics-external-research.md §B.2 (Snowplow good/bad
  events)
```

### D.5 Recon: DR-runbook + JSONL-export-tooling för analytics

```
TASK: Recon för analytics DR runbook + JSONL export/import tooling

CONTEXT
═══════
Bedfront's PMS reliability engine has:
- docs/runbooks/pms-reliability-dr.md (full DR runbook with scenario
  tree, RTO/RPO per scenario, JSONL export/import procedures)
- scripts/pms-reliability/{export,import,verify}.ts (250-700 LOC each)

Per admin/CLAUDE.md:
  "The reliability engine has a portable state: every important row
   (inbox, outbound, cursors, idempotency, audit events) can be
   streamed to JSONL and restored into any compatible DB. This gives
   us a second-order backup independent of Neon PITR."

Analytics has no equivalent. Track 1 §B.7 confirms outbox state IS
portable (the whole pipeline state lives in 4 tables: analytics.event,
analytics.outbox, analytics.daily_metric, analytics.tenant_config).

LEVERANS
════════
Recon document at admin/_audit/analytics-dr-recon.md covering:

1. Scenario tree (mirrors pms-reliability-dr.md structure):
   - Scenario 1: Inngest down for 8h.
     - Mode: pipeline backlog accumulates.
     - Recovery: scan-analytics-outbox cron picks up after Inngest
       returns.
     - RTO: < 1 hour (cron interval) post-Inngest restoration.
     - RPO: 0 (no data lost — outbox is durable).

   - Scenario 2: Postgres analytics schema corruption (single table).
     - Mode: data loss in a specific table.
     - Recovery: Neon PITR + JSONL restore.
     - RTO: 1-4 hours.
     - RPO: minutes to hours depending on Neon PITR window.

   - Scenario 3: Tenant requests data export per GDPR Article 20.
     - Recovery: scripts/analytics/export.ts --tenantId=X →
       JSONL.gz file.
     - SLA: 30 days per Article 12(3).

   - Scenario 4: Tenant deletion (GDPR Article 17 / Clerk org.deleted).
     - Recovery: scripts/analytics/erase.ts --tenantId=X (bundles
       with Tier 1 #6 RTBF).

   - Scenario 5: Migration to BigQuery cold tier.
     - Approach: scripts/analytics/export.ts --age-greater-than=
       365days → bigquery-load via gsutil.
     - Then DELETE old rows from analytics.event partition.

2. Export tooling design:
   - scripts/analytics/export.ts (~250 LOC).
   - Streaming via Postgres cursor (we have this pattern in
     aggregate-day-runner.ts).
   - Output: JSONL stdout OR file. .gz support.
   - Tables exported: analytics.event, analytics.outbox,
     analytics.daily_metric, analytics.tenant_config.
   - Filters: --tenantId, --age-greater-than, --table, --since.
   - Schema: each line is { table: "...", row: {...} } so the
     import side knows where to put rows.

3. Import tooling design:
   - scripts/analytics/import.ts (~250 LOC).
   - Modes: --dry-run, --overwrite, --tenantId-filter.
   - Conflict resolution: composite-unique upsert (idempotent re-
     import).
   - Report: rows imported per table, conflicts encountered, failures.

4. Verify tooling:
   - scripts/analytics/verify.ts (~150 LOC).
   - Round-trip: export → import to fresh DB → diff → confirm
     identical.
   - npm run analytics:verify can be quarterly drill.

5. Drill schedule (matches PMS pattern):
   - Weekly JSONL snapshot to S3.
   - Quarterly restore drill (Neon branch + verify).
   - Monthly verify in CI.

6. Tests:
   - Export → import → verify round-trip is bit-identical.
   - Tenant filter works.
   - Age filter works.
   - Conflict resolution is idempotent.

OUT OF SCOPE
════════════
- BigQuery integration (Tier 2 #10 cold-tier strategy).
- Implementation. Recon only.

REFERENCES
══════════
- docs/runbooks/pms-reliability-dr.md
- scripts/pms-reliability/{export,import,verify}.ts (in-house
  exemplar)
- _audit/analytics-external-research.md §B.7 (outbox state is
  portable), §B.12 (cold-tier strategy)
```

### D.6 Recon: GDPR RTBF flow för analytics events

```
TASK: Recon för GDPR right-to-be-forgotten flow på analytics-pipelinen

CONTEXT
═══════
Per Track 1 admin/_audit/analytics-external-research.md §B.8
(GDPR Recital 26 verbatim): "Personal data which have undergone
pseudonymisation, which could be attributed to a natural person by the
use of additional information should be considered to be information on
an identifiable natural person."

Bedfront's analytics events carry pseudonymized fields:
- user_agent_hash (per-tenant salt + 16 hex)
- actor_id (e.g. email_<sha256-16hex> for email-only bookings, or
  GuestAccount.id for authenticated guests)

These are personal data under GDPR. RTBF requests must therefore reach
analytics.event and analytics.outbox.

Currently:
- Salt is minted at tenant creation (app/api/webhooks/clerk/route.ts:
  68) but never rotated.
- No RTBF flow exists.
- Tenant deletion (Clerk org.deleted) has no analytics-side handler.

LEVERANS
════════
Recon document at admin/_audit/analytics-rtbf-recon.md covering:

1. RTBF scope:
   - Tenant-level: org.deleted → erase ALL events for tenant_id.
   - Guest-level: Article 17 request from a specific guest → erase
     all events for (tenant_id, actor_id = X).

2. Actor-id enumeration:
   - For an authenticated guest: actor_id = GuestAccount.id (cuid).
   - For an email-only booking: actor_id = "email_" +
     sha256(tenantId + ":" + lowercased-trimmed-email).slice(0, 16).
   - Helper: enumerateActorIdsForGuestAccount(guestAccountId,
     tenantId): string[] returns all known actor_id values.
   - Helper: emailToActorId(tenantId, email): string deterministically
     reproduces an email-pseudonym for erasure.

3. Erase API:
   - POST /api/admin/analytics/erase
   - Body: { tenantId: string, actorIds?: string[], reason: string }
   - Returns: { jobId: string }
   - Auth: Clerk admin session + role check (DPO-only? operator-only?)
   - The job is async via Inngest (large delete sets can take
     minutes).

4. Inngest job: inngest/functions/erase-analytics-events.ts
   - Concurrency-keyed by tenantId.
   - Steps:
     a) DELETE FROM analytics.outbox WHERE tenant_id=X AND
        actor_id IN (...).
     b) DELETE FROM analytics.event WHERE tenant_id=X AND
        actor_id IN (...).
     c) For tenant deletion: also DELETE analytics.daily_metric (the
        aggregator output is itself derivative of personal data).
     d) Audit-log: log("info", "analytics.rtbf.erase_complete", {
        tenantId, actorIds, rowsDeleted, jobId, operatorUserId,
        reason }).

5. Salt-rotation API (bundled per Tier 2 #7):
   - POST /api/admin/analytics/rotate-salt
   - Body: { tenantId: string, reason: string }
   - Invalidates user_agent_hash for the tenant going forward.
   - PRE-rotation salt is destroyed (purged from
     Tenant.settings.analyticsSalt — only the new salt is kept).
   - After rotation, pre-rotation events are de facto anonymized
     because the original UA string was never stored — only the
     hash. This is the "wipe my behavioral history" semantic per
     _storefront-context.ts:60-63.

6. Tenant-deletion integration:
   - app/api/webhooks/clerk/route.ts on org.deleted:
     - Today: delete the Tenant row (cascades elsewhere).
     - Tomorrow: ALSO trigger erase-analytics-events job.

7. Tests:
   - Erase deletes rows from outbox + event.
   - Erase preserves rows for OTHER tenants (cross-tenant isolation).
   - Salt rotation invalidates pre-rotation hashes.
   - Audit log captures.

8. Compliance documentation:
   - docs/analytics/gdpr-rtbf.md — operator-facing procedure for
     handling a guest's Article 17 request.
   - docs/analytics/aggregator.md update: section "Privacy and RTBF"
     pointing to the API + procedure.

OUT OF SCOPE
════════════
- Right to data portability (Article 20) — separate work, can use
  scripts/analytics/export.ts from Tier 1 #5.
- Implementation. Recon only.
- Cross-pipeline RTBF (e.g. erase analytics + draft-orders +
  payments simultaneously) — separate orchestration concern.

REFERENCES
══════════
- _audit/analytics-external-research.md §B.8 (GDPR Recital 26
  verbatim, EDPB pseudonymisation guidelines, TCF v2.2)
- app/_lib/analytics/pipeline/schemas/_storefront-context.ts:60-63
  (salt rotation target spec)
- app/_lib/analytics/pipeline/schemas/booking-completed.ts:27-39
  (email pseudonym scheme)
- app/api/webhooks/clerk/route.ts (Clerk webhook integration point)
```

---

## E. Vad vi GÖR rätt (Shopify-grade fundament)

The list below is not self-congratulation. It establishes what
must NOT be touched while the Tier 1 fixes ship — these are the
load-bearing parts of the architecture that any "improvement"
should be evaluated against for regression risk.

1. **Two-layer schema validation** (D.1 #1) — emitter + drainer.
   Matches Shopify Monorail (§B.1). Stronger than Snowplow's
   single-layer enforcement. *Don't relax this for performance
   reasons.*

2. **Worker validator parity test** (D.1 #1) — hand-rolled
   validators with a CI-enforced parity test against Zod. Forced
   by 30 KB tree-shake budget per `admin/CLAUDE.md` "Analytics
   pipeline — worker validator parity rule". Unique to Bedfront;
   matches Snowplow iglu's lockstep discipline. *Worker can change
   freely as long as parity test passes.*

3. **Object-Past-Tense-Verb naming convention** (D.1 #3) —
   consistent across all 26 active events. Matches Amplitude
   (§B.4). *New events MUST follow the pattern; consider adding
   the static check from Tier 3 #14.*

4. **Transactional outbox with persistence-before-processing**
   (D.2 #5, D.2 #9) — exactly Chris Richardson's canonical pattern
   (§B.7). *Don't move emit-time work outside the transaction.*

5. **Three-layer dedup at three pipeline stages** (D.2 #8) —
   `(tenant_id, event_id)` UNIQUE on outbox; `(event_id,
   occurred_at)` ON CONFLICT on event; composite-unique upsert on
   daily_metric. Matches Stripe (§B.5). *This is the
   exactly-once-effective property. Touch with extreme care.*

6. **Pre-aggregation pattern** (D.5 #19, D.5 #20) — `analytics.daily_metric`
   with `(tenant_id, date, metric, dimension, dimension_value)`
   grain. Matches Shopify exploration data models (§B.1) and Druid
   rollup (§B.6). *Defers OLAP-DB graduation; protect the additivity
   invariant.*

7. **Idempotent re-runnable aggregator** (D.8 #28) — composite-
   unique upsert + pure-compute fold. Matches Druid perfect rollup
   (§B.6). *Backfill is "re-run the aggregator over the affected
   window."*

8. **Tenant-scoped queries enforced by static check** (D.6 #24) —
   `verify-phase5a-aggregator.ts` check #10. *Mechanical
   enforcement is stronger than convention. Don't disable.*

9. **Phase 5A architectural separation** — registry, aggregator,
   runner, Inngest functions, verifier are all in their own files
   with clean interfaces. Phase 5B parity-validation can ship
   without touching any Phase 5A boundaries. *Protect the
   boundaries; new metrics extend the registry, not the
   aggregator.*

10. **Consent-gated emit at the loader** (D.3 #11) — two-layer
    enforcement (client `loader.ts:235` + server collect endpoint).
    Matches TCF v2.2 publisher role (§B.8). *Never emit without
    consent.*

11. **City-level geo, lat/lng never enters pipeline** (D.3 #13) —
    matches GDPR-grade privacy engineering (§B.8 city-level test).
    *Don't downgrade to street-level for "marketing insights"
    without going back through legal.*

12. **Same-day approximation for funnel-rates explicitly
    documented** (D.7 #26) — `docs/analytics/aggregator.md`
    "Same-day approximation" section. Bias is acknowledged, not
    hidden. *When new derived metrics ship, document the
    approximation up front.*

---

## F. Out of scope för denna audit

- **Phase 5B** (parity-validation, dashboard cutover from legacy
  AnalyticsDailyMetric to new analytics.daily_metric) — separate
  work. Phase 5B's parity-tolerances per (metric, dimension) are
  the OPEN §9.8 from the Phase 5A recon.
- **Phase 5C** (drop legacy `AnalyticsDailyMetric`, `AnalyticsEvent`,
  `AnalyticsLocation`) — after 30+ days stable parity post-5B.
- **Phase 4 CDC events** (`accommodation_published/archived/
  price_changed`) — separate emit-roadmap; registry has the schemas
  but emit deferred to Postgres CDC integration.
- **Funnel cube design** (per-product, per-channel funnel rates) —
  documented as out-of-scope in `docs/analytics/aggregator.md`
  Phase 5A; tracked here as Tier 3 #20.
- **ML / anomaly detection** on analytics data — Tier 3 #18,
  candidate post-launch.
- **Multi-region replication** — Tier 3 #16, candidate post-10k-
  tenant launch.
- **Cross-pipeline RTBF orchestration** (analytics + draft-orders +
  payments simultaneously) — separate orchestration work; this
  audit focuses on analytics-only RTBF (Tier 1 #6).

---

## G. References

- `admin/_audit/analytics-external-research.md` (Track 1, external
  research, merged via PR #42 on 2026-05-04)
- `admin/_audit/analytics-phase5a-aggregator-recon.md` (Phase 5A
  recon, for cross-reference on §6.6 storage projection and §6.7
  idempotency invariant)
- `admin/CLAUDE.md` ("Shopify-grade quality bar" + "Analytics
  pipeline — worker validator parity rule" + "Enterprise
  infrastructure" sections)
- `docs/analytics/event-catalog.md` (event registry,
  cart_id-lifecycle spec, source-channel enum)
- `docs/analytics/tiers.md` (SLO definitions per tier)
- `docs/analytics/aggregator.md` (Phase 5A runbook + funnel-metrics
  section + same-day approximation note)
- `docs/runbooks/pms-reliability-dr.md` (in-house exemplar for
  Tier 1 #5 DR runbook)
- `prisma/migrations/20260430145830_analytics_pipeline_foundation/migration.sql`
  (analytics.event partitioning DDL, lines 47-69)
- `prisma/migrations/20260504144722_analytics_phase5a_aggregator/migration.sql`
  (analytics.daily_metric, lines 35-39 composite unique)
- `inngest/functions/drain-analytics-outbox.ts` (DLQ pattern, lines
  255-299)
- `scripts/replay-dlq.ts` (manual DLQ recovery, in-house exemplar)
- `scripts/verify-phase5a-aggregator.ts` (17-check verifier, in-
  house exemplar for static gap detection)

---

**End of audit document.**
