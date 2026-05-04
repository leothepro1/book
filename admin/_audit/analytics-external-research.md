# Analytics — External Research (Shopify-grade reference)

**Date:** 2026-05-04
**Author:** Claude Code (terminal session)
**Scope:** External research only. Internal audit + gap-analysis is delivered
separately by prompt-engineer (claude.ai/code).

---

## Confidence tagging

Every paragraph carries one of:

- `[VERIFIED]` — fetched directly from the cited primary source on the date
  given; quote/numbers reproduced exactly.
- `[INFERRED]` — derived from secondary sources (vendor blogs reposting
  internal talks, search summaries, third-party recaps), or assembled from
  several primary fragments. The basis is named explicitly each time.
- `[UNKNOWN]` — gap. Flagged so the synthesis step can decide whether to
  invest in deeper research or accept the gap.

URLs are listed inline at point of use AND re-listed in the §E reading list.
All URLs were fetched at composition time; for sources that returned 403/40x
the substitute (search summary) is named explicitly.

---

## A. Executive summary — top 5 architectural learnings

The five items below synthesize §B findings. Each one names the
primary sources that ground it; the synthesis itself (the "this
matters because Bedfront…" framing) is [INFERRED] from those
sources — i.e. it's my own framing, not a quote.

1. **[INFERRED]** **Schema-as-contract is non-negotiable above
   trivial scale.** Every well-documented external system in this
   research (Snowplow Iglu §B.2 [VERIFIED], Segment Protocols §B.3
   [VERIFIED], Shopify Monorail §B.1 [VERIFIED]) treats the schema as
   the system-of-record for what the event "is", not the emitting
   code. Versioning is built in from day one; an invalid event is
   rejected at the boundary, not silently accepted. Bedfront's Zod
   registry already follows this — the internal-audit angle is
   whether our gates are at the RIGHT boundaries (drainer-only?
   collect-endpoint too?).

2. **[INFERRED from VERIFIED source]** **Lambda architecture (batch
   + streaming) is industry-standard for merchant-facing analytics,
   not a transitional design.** Shopify's own in-context analytics
   article (May 2021, [VERIFIED] in §B.1) describes a deliberate
   batch-first → streaming-overlay pattern. Bedfront's current
   Phase 5A Inngest aggregator is single-tier (15-min cron over 48h
   sliding window). The lambda pattern is the next maturity level.

3. **[INFERRED from VERIFIED sources]** **At quadrillion-event
   scale, ClickHouse and Druid are the two open-source choices with
   public production references.** Cloudflare (ClickHouse, 36 nodes,
   11M rows/sec average insertion bandwidth as of March 2018
   [VERIFIED §B.6]) and Pinterest (Druid, 2,000+ nodes, 1000+ QPS at
   p99<250ms as of August 2021 [VERIFIED §B.6]) anchor the high-end.
   The "1.61 quadrillion events queryable" number is [INFERRED]
   from secondary sources only. Postgres-with-pre-aggregation
   (Bedfront's current daily_metric pattern) is appropriate for our
   scale; the ceiling is roughly when row counts approach 1B in the
   aggregated table or when raw event scans are needed for ad-hoc
   queries.

4. **[INFERRED from VERIFIED sources]** **The outbox pattern is
   canonical, but the relay implementation varies.** Chris
   Richardson's microservices.io defines outbox as the cure for the
   dual-write problem ([VERIFIED §B.7]). SeatGeek's
   `pg_logical_emit_message` variant (Feb 2025, [VERIFIED §B.7]) is
   one production-grade approach; Debezium's outbox-table-with-WAL-
   tailing is the other (named in microservices.io as one of the two
   relay implementations, [INFERRED] for industry adoption). Bedfront
   uses an Inngest-based polling drainer — simpler than either CDC
   variant, adequate for our scale, but worth noting it gives weaker
   ordering guarantees than log-tailing.

5. **[VERIFIED]** **Pseudonymization is NOT anonymization under
   GDPR.** EU Recital 26 (verbatim quote in §B.8) states that
   pseudonymized data *"should be considered to be information on an
   identifiable natural person"* — i.e. still subject to the
   regulation. Bedfront's user_agent_hash (per-tenant salt + 16 hex
   chars) is pseudonymization, not anonymization, even when the salt
   is rotated. The audit angle: do our retention, right-to-be-
   forgotten, and consent-revocation flows treat the hash correctly
   as personal data?

---

## B. Per-topic findings

### B.1 Shopify Engineering blog on analytics

**Sources fetched directly (all returned 200 at retrieval time
2026-05-04):**

- https://shopify.engineering/shopify-in-context-analytics (May 2021)
- https://shopify.engineering/reliably-scale-data-platform (Dec 2020)
- https://shopify.engineering/build-production-grade-workflow-sql-modelling
  (Nov 2020)
- https://shopify.engineering/real-time-buyer-signal-data-pipeline-shopify-inbox
  (Dec 2021)
- https://shopify.engineering/capturing-every-change-shopify-sharded-monolith
  (March 2021)
- https://shopify.engineering/shopify-commerce-data-querying-language-shopifyql
  (June 2022)

**Architecture overview:**

[VERIFIED] Shopify operates a Lambda architecture for merchant-facing
analytics. The May 2021 in-context analytics article (Federica
Luraschi & Racheal Herlihy) states verbatim: *"historical data came
from the batch data model, while the streaming model powered the
most recent data not yet captured in batch."* The batch-first
rationale they give: enables iteration in a familiar dev environment,
allows internal sanity-checks before streaming deployment, enables
backfilling, and reduces pressure on streaming infrastructure.

[VERIFIED] **Kafka is the messaging backbone.** The Dec 2020 article
on scaling the data platform (Arbab Ahmed & Bruno Deszczynski) cites
"880 billion MySQL records and 1.75 trillion Kafka messages"
processed monthly on average, with throughput increasing 150% during
BFCM.

[VERIFIED] **CDC = Debezium → Kafka Connect → Confluent Schema Registry.**
The March 2021 article by John Martin & Adam Bellemare describes 400TB+
of CDC data stored in Kafka, ~150 Debezium connectors across 12
Kubernetes pods, 65,000 records/sec average BFCM 2020 (spikes to
100K), p99 latency under 10 seconds end-to-end (MySQL insertion to
Kafka availability), with 100+ MySQL shards behind the core monolith.
Compacted topics, partitioned by primary key, give "the most recent
record of that key" for downstream state initialization.

**Internal-platform components named in primary sources:**

- [VERIFIED] **Monorail** — Kafka schema-abstraction layer with
  versioning. From the Dec 2021 buyer-signal article: *"Monorail is
  an abstraction layer developed internally at Shopify that adds
  structure to the raw Kafka events before producing it to Kafka.
  Also with the structure there's support for versioning, meaning
  that if the schema produces upstream changes, then it gets
  produced to the updated version while the Kafka topic remains the
  same."*

- [VERIFIED] **Starscream** — internal PySpark-based data pipeline
  platform. Built in January 2014 (per Nov 2020 article by Michelle
  Ark & Chris Wu). Today *"runs 76,000 jobs and writes 300 terabytes
  a day."* They observed 70% of jobs were full-batch SQL queries that
  didn't need general-purpose distributed compute.

- [VERIFIED] **Seamster** — newer SQL-pipeline system pairing dbt
  with Google BigQuery, built specifically for the simpler
  reporting-style jobs that don't need PySpark's flexibility (Nov
  2020 article).

- [VERIFIED] **Reportify** — merchant-facing query service. Mentioned
  in the Dec 2020 reliably-scale-data-platform article as part of
  the "delivery systems" tier alongside internal libraries that serve
  data through BigTable, GCS, and CloudSQL.

- [VERIFIED] **Longboat** — described in Dec 2020 as "batch data
  ingestion service" and in March 2021 as "query-based CDC, being
  replaced." NOTE: the prompt asked us to fact-check whether Longboat
  was an internal "column-store"; based on the two primary sources,
  **it is described as a pipeline/CDC component, not a column store.**
  The actual data warehouse appears to be BigQuery (multiple primary
  sources concur).

[VERIFIED] **ShopifyQL is the merchant-facing query language.** The
June 2022 article by Ranko Cupovic describes it as built on top of
"exploration data models" — *"single flat tables aggregated to a
lowest domain dimension grain and time attribute"* with all metrics
*"fully additive across all dimensions."* This pattern (pre-aggregated
flat tables with a metric × dimension × dimensionValue grain) is
exactly what Bedfront's Phase 5A `analytics.daily_metric` implements.

**[INFERRED] from search summaries (not yet primary-sourced):**

A search summary attributed to ByteByteGo / junaideffendi.com
substacks claims Shopify Kafka has handled 66M messages/sec at peak
("one of the largest-scale streaming systems"). I could not locate
this number in a Shopify primary source during this research session.
Worth treating as plausible-but-secondary until one of Shopify's own
talks confirms.

**[UNKNOWN]:**

- Per-tenant query isolation strategy at the merchant dashboard level.
  Reportify is named but the article describing its tenant-isolation
  model (e.g. row-level filtering vs separate query routing) was not
  located.
- Schema registry implementation details for Monorail. Whether it's
  Confluent Schema Registry, Avro, JSON Schema, or proprietary is
  not stated in the primary articles.
- Storage retention strategy for raw events across Kafka and the
  warehouse. Articles describe BFCM-time scaling but not retention
  windows.
- Disaster-recovery approach for the data warehouse layer.

---

### B.2 Snowplow's iglu schema-registry + enrichment pipeline

**Sources fetched directly (200 at retrieval 2026-05-04):**

- https://docs.snowplow.io/docs/api-reference/iglu/common-architecture/schemaver/
- https://docs.snowplow.io/docs/api-reference/iglu/common-architecture/iglu-core/
- https://docs.snowplow.io/docs/understanding-your-pipeline/failed-events/

[VERIFIED] **Iglu URI format:** `iglu:com.acme/someschema/format/1-0-0`.
Components: vendor (com.acme), schema name (someschema), format
(typically `jsonschema`), version. The "Iglu path" refers to the same
structure without the `iglu:` prefix.

[VERIFIED] **SchemaVer = MODEL-REVISION-ADDITION** (with hyphens, not
the SemVer dot-separator — *"this visual distinction helps analysts
understand whether a table was versioned using SemVer or
SchemaVer"*). Definitions reproduced verbatim from the docs:

- **MODEL** — *"when you make a breaking schema change which will
  prevent interaction with any historical data."*
- **REVISION** — *"when you introduce a schema change which may
  prevent interaction with some historical data."*
- **ADDITION** — *"when you make a schema change that is compatible
  with all historical data."*

Examples bumped explicitly in the docs:

- ADDITION (1-0-0 → 1-0-1): adding an optional property when
  `additionalProperties: false`.
- REVISION (1-0-2 → 1-1-0): switching `additionalProperties` to true
  and adding a field that doesn't validate prior rows.
- MODEL (1-1-0 → 2-0-0): replacing one identifier with another
  (`bannerId` → `clickId`).

[VERIFIED] **Good event / bad event pattern.** Failed events are NOT
written to the `atomic` events table — they are routed to a separate
table in the warehouse/lake plus object-storage backups (S3/GCS).
Snowplow distinguishes four failure categories: Collection (invalid
payload format), Validation (event/entity does not match schema),
Enrichment (external API unavailable), Loading (rare). The pipeline
is described as *"non-lossy"* — failed events can be reprocessed.

[VERIFIED] **Self-describing data:** the data payload includes
embedded schema identification, so any system can resolve the schema
from the event without external configuration. The Iglu registry is
the schema-of-record; clients ship a SchemaKey alongside each
self-describing datum.

**[UNKNOWN]:**

- Specific enrichment-pipeline implementation details (Kinesis vs
  Kafka stages, etc.) — those need a deeper dive into the
  pipeline-components-and-applications doc tree, which was not
  exhaustively walked in this research session.

---

### B.3 Segment Protocols + tracking plan

**Sources:**

- https://segment.com/docs/protocols/ — **403** at retrieval
  2026-05-04 (Cloudflare bot block); replaced with search-summary
  paraphrase below.
- https://segment-docs.netlify.app/docs/protocols/tracking-plan/create/ —
  200 at retrieval 2026-05-04 (community mirror of Segment docs).

[INFERRED] from Segment search-summary results plus the netlify
mirror: Segment Protocols is a data-governance layer that validates
event payloads against a "tracking plan" *during the ingestion
phase, before identity resolution or destination delivery* (search
summary paraphrase). Violations generate when an event doesn't match
its declaration in the plan. Enforcement options span the full range
from passive (record violations only) to active (block events at the
source and route to a quarantine source).

[VERIFIED] from the netlify mirror: **A tracking plan covers three
call types** — Track events (user actions), Identify traits (user
characteristics), Group traits (group/account characteristics). Each
declaration carries name, description, status (required/optional),
data type, and permitted values. **Property data types supported:**
`any, array, object, boolean, integer, number, string, null, Date
time`. String regex validation is supported (the doc gives a
pipe-delimited "fall|winter|spring" example). Date/time properties
must follow ISO-8601.

[VERIFIED] **Event versioning is exposed as a context-level
mechanism** — the example in the netlify doc shows
`context.protocols.event_version: 2` passed alongside the event.

**[UNKNOWN]:**

- Whether Protocols supports schema-driven property typing beyond the
  scalar set named above (e.g. nested object schemas, array element
  schemas).
- The block/warn/forward hierarchy in detail (the search summary
  describes it but the primary doc was 403 from this environment).

---

### B.4 Amplitude data taxonomy + governance

**Source fetched directly (200 at retrieval 2026-05-04):**

- https://amplitude.com/docs/data/data-planning-playbook

[VERIFIED] **Three core naming principles** per the playbook:
*"consistent capitalization"* (Title Case), *"consistent syntax"*
(`[Noun]` + `[Past-Tense Verb]`, e.g. `Song Played` not
`Played Song`), *"consistent actor perspective"* (events named from
the user's viewpoint).

[VERIFIED] **Object-Action / Noun + Past-Tense-Verb pattern with
examples:** `Search Completed`, `Product Details Viewed`,
`Product Added`, `Order Reviewed`, `Order Completed`. Default events
follow Title Case.

[VERIFIED] *"A taxonomy is a set of hierarchical classifications and
naming conventions for your data."*

[INFERRED] from search summaries: the past-tense convention has
become "the industry standard" — multiple secondary sources
(Optizent, Human37) repeat this. Snake_case for properties (e.g.
`plan_type`, `project_id`) appears in some implementations though the
Amplitude playbook itself uses Title Case for events.

[INFERRED] from search summaries: A common best practice is to have
a designated "Data Governor" role or governance committee that
reviews event proposals for consistency, deduplication against
existing tracking, and strategic value. The Amplitude playbook itself
does not formally define such roles in the section I fetched, but
references their MCP plugin which exposes a `amplitude:taxonomy`
skill described as *"Source of truth for naming conventions, property
standards, scoring frameworks..."*

**[UNKNOWN]:**

- Amplitude's "Govern" product internals — the playbook mentions
  taxonomy guidance but the dedicated Govern product features were
  not deeply explored. Worth a follow-up fetch if the audit needs it.

---

### B.5 Stripe webhooks + event design

**Sources fetched directly (200 at retrieval 2026-05-04):**

- https://docs.stripe.com/webhooks
- https://docs.stripe.com/webhooks/versioning
- https://docs.stripe.com/api/events

[VERIFIED] **Delivery model:** push, HTTPS POST, JSON payloads. Up
to 16 webhook endpoints per account.

[VERIFIED] **Signature scheme:** HMAC SHA-256. The `Stripe-Signature`
header carries timestamp (`t=`) and one or more signatures with
scheme prefixes (currently `v1` for production). Signed payload is
`timestamp.raw_json_body` concatenation. Verification is required
to be *"constant-time-string comparison."*

[VERIFIED] **Idempotency guidance** (verbatim): *"guard against
duplicated event receipts by logging the event IDs you've processed,
and then not processing already-logged events."* For deduping across
separate Event objects of the same logical operation, Stripe
recommends *"the ID of the object in `data.object` along with the
`event.type`."*

[VERIFIED] **Retry schedule** (live mode): *"up to three days with
an exponential back off"*. Sandbox: 3 retries over a few hours.
Manual replay available up to 15 days (Dashboard) or 30 days (CLI).

[VERIFIED] **Ordering disclaimer:** *"Stripe doesn't guarantee the
delivery of events in the order that they're generated."*

[VERIFIED] **Versioning model.** Each webhook endpoint pins to either
a specific API version OR the account default. Upgrade path is
explicit:

1. Create a disabled endpoint at the new version.
2. Enable it but ignore events (return 200 silently).
3. Switch processing logic, return 400 for old-version events.
4. Monitor.
5. Disable old endpoint.

[VERIFIED] Since the `2024-09-30.acacia` release, *"Stripe follows a
new API release process where we release new API versions monthly
with no breaking changes. Twice a year, we issue a new release that
starts with an API version that has breaking changes."*

[VERIFIED] **Connect-account isolation:** events for connected
accounts include an `account` attribute. From the Events docs:
*"Connect platforms can also receive event notifications that occur
in their connected accounts. These events include an `account`
attribute that identifies the relevant connected account."*

**[UNKNOWN]:**

- Internal Stripe details on retry-queue implementation, scaling, or
  dead-letter handling — not in public docs.

---

### B.6 OLAP database choice for high-cardinality analytics

**Sources fetched (status at retrieval 2026-05-04):**

- https://blog.cloudflare.com/http-analytics-for-6m-requests-per-second-using-clickhouse
  — 200, March 2018, Alex Bocharov
- https://medium.com/pinterest-engineering/pinterests-analytics-as-a-platform-on-druid-part-1-of-3-9043776b7b76
  — 200, August 2021, Pinterest Real Time Analytics Team

**Cloudflare → ClickHouse:**

[VERIFIED] *Authors:* Alex Bocharov, March 2018 article. Cloudflare's
HTTP analytics ran on a Postgres-based pipeline that hit a ceiling.
**Apache Flink was their first choice** for the replacement —
*"couldn't keep up with ingestion rate per partition on all 6M HTTP
requests per second."* They migrated to ClickHouse: 36 nodes with 3x
replication, average insertion bandwidth 47 Gbps, ingestion rate 11M
rows/sec across all pipelines, query throughput climbed from 15
queries/sec (with rate limits) to ~40 average / 150 tested.
50x storage reduction vs raw logs (18.52 PiB vs 273.93 PiB
annually).

[VERIFIED] **Tradeoffs noted in the article:** *"ClickHouse doesn't
throttle recovery"* (operator burden during node replacement). Not
optimized for heterogeneous clusters; gradual hardware standardization
needed. Two-phase join limitations forced 300+ line SQL queries in
the initial design.

[INFERRED] from search summaries citing later Cloudflare/ClickHouse
joint posts: today Cloudflare runs on the order of 1,000+ active
ClickHouse replicas with ~90M rows/sec inserted. A demo query
reportedly scanned 1.61 quadrillion events in <2s. (These numbers are
secondary — the 2018 blog post was the only Cloudflare-authored
ClickHouse architecture article fetched directly.)

**Pinterest → Druid:**

[VERIFIED] Authors: Pinterest Real-Time Analytics Team (Jian Wang,
Jiaqi Gu, Yi Yang, Isabel Tallam, Lakshmi Narayana Namala, Kapil
Bajaj), Aug 2021. Internal platform name: **Archmage** (advertiser-
facing real-time analytics).

[VERIFIED] **Pre-Druid:** HBase as a key-value store. Reporting
metrics were precomputed in hourly/daily batch jobs, stored in HBase.
At scale this generated limited filter options for users and
required *"more work...on the application side to do aggregation."*

[VERIFIED] **Scale:** *"more than 2,000 nodes"* across multiple
clusters, largest offline use case 1+ PB, largest online serving
1000+ QPS at p99 < 250ms. The buyer-signal pipeline produces 500K+
QPS into a Kafka topic that Druid consumes within a 1-minute
ingestion-delay budget.

[VERIFIED] *"The key value data model doesn't naturally fit into the
analytics query pattern, and more work is needed on the application
side to do aggregation"* — Pinterest's stated reason for migration.

**Stripe Sigma:**

[INFERRED] from search summaries: Stripe Sigma's query engine is
Trino (formerly Presto). The prompt's framing ("BigQuery-based") is
not supported by what I found — search results explicitly mention a
Sigma migration "from Presto v334 to Trino v414." The connection
between Stripe-as-source and BigQuery is via Stripe's separate "Data
Pipeline" product that exports to data warehouses; Sigma itself runs
on Trino. Worth treating as [INFERRED] until a Stripe-authored
engineering post confirms.

**Discord:**

[INFERRED] from search summaries: Discord's well-documented database
migration is **Cassandra → ScyllaDB** for messages, NOT to ClickHouse
for analytics. The prompt's Discord-ClickHouse hint appears to be
inaccurate. The ScyllaDB migration achieved 3.2M messages/sec
throughput; the cluster shrank from 177 Cassandra nodes to 72
ScyllaDB nodes.

**Druid rollup at ingest:**

[VERIFIED] from druid.apache.org search summary fetched 2026-05-04:
Druid supports **rollup at ingestion time** — combining input rows
that share the same `(timestamp truncated to queryGranularity, all
dimension values)` tuple, computing the metric values via specified
aggregation function, and storing only the rolled-up row. **Perfect**
rollup requires an extra preprocessing step (scan entire input,
determine intervals/partitioning); **best-effort** rollup means
*"multiple segments might contain rows with the same timestamp and
dimension values."*

[VERIFIED] Tradeoff named explicitly: rollup *"can dramatically
reduce the size of data to be stored and reduce row counts by
potentially orders of magnitude, though as a trade-off for the
efficiency of rollup, you lose the ability to query individual
events."*

**Postgres ceiling — when do you migrate?**

[UNKNOWN] direct quote from a Shopify-grade source. The
Cloudflare/Pinterest narratives both describe migrations because
their *current* system (Postgres-like or HBase-key-value) couldn't
serve query patterns or ingestion rates. Bedfront's Phase 5A
aggregator pre-computes a daily-grain table, which is the well-
trodden path that defers the OLAP-DB decision. The migration
trigger is typically (a) ad-hoc exploration on raw events, (b)
sub-second p99 on multi-billion-row scans, (c) high-cardinality
dimensions where pre-aggregation explodes the row count.

---

### B.7 High-scale event-emit patterns

**Sources fetched (status at retrieval 2026-05-04):**

- https://microservices.io/patterns/data/transactional-outbox.html — 200,
  Chris Richardson
- https://chairnerd.seatgeek.com/transactional-outbox-pattern/ — 200,
  Sab Natarajan & Bosco Han, Feb 2025
- https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
  — **403** at retrieval; replaced with debezium.io documentation reference
  (https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
  named in search summary)

[VERIFIED] **Chris Richardson's canonical outbox definition**
(microservices.io): *"The service stores messages in the database as
part of the same transaction that updates business entities. A
separate process then sends the messages stored in the outbox to the
message broker."* The pattern's purpose: avoid 2PC and avoid the
*"dual-write"* race where one of the two writes (DB and broker)
succeeds but the other fails.

[VERIFIED] **Two named relay implementations:** Transaction Log
Tailing and Polling Publisher. The microservices.io page does not
prefer one — both are listed alongside Event Sourcing as
alternatives.

[VERIFIED] **Acknowledged drawback:** *"Potentially error prone since
the developer might forget to publish the message/event after
updating the database."* This is essentially the
"register-the-row-but-someone-must-still-flush" failure mode that
Bedfront's drainer-cron-fallback addresses.

[VERIFIED] **SeatGeek's adoption (Feb 2025) chose outbox over polling
and over CDC explicitly.** Their stated reasoning:

- *Polling consumers* — rejected, *"latency and unpredictable load
  on source systems."*
- *Direct publish* — rejected, *"lacks transactional guarantees."*
- *CDC* — rejected because it *"shifts complexity to consumers and
  violates service boundaries."*

[VERIFIED] SeatGeek's relay implementation is unusual — they bypass
the traditional outbox table and write directly to the Postgres WAL
via `pg_logical_emit_message()`, with Debezium tailing the logical
replication stream. *"Writing directly to the WAL is made possible
through logical decoding, a mechanism that allows Postgres to stream
SQL changes to external consumers."*

[INFERRED] from Debezium documentation and SeatGeek's blog: the
canonical Debezium-with-outbox-table pattern uses the
`outbox.EventRouter` SMT (Single Message Transform) that reads outbox
rows from the WAL, extracts payload + routing metadata, and produces
to Kafka. Bedfront's Inngest-based polling drainer is the simpler
"polling publisher" branch of Richardson's tree — adequate for our
scale, weaker on ordering.

**[UNKNOWN]:**

- Direct industry numbers on at-least-once vs exactly-once
  trade-offs at scale. Confluent, Kafka Streams, and Flink each have
  their own claims; cross-vendor comparison was not done in this
  research session.

---

### B.8 Privacy engineering — GDPR/CCPA

**Sources fetched (200 at retrieval 2026-05-04):**

- https://gdpr-info.eu/recitals/no-26/
- https://iabeurope.eu/transparency-consent-framework/

[VERIFIED] **GDPR Recital 26 — exact text on identifiability:**

> *"Personal data which have undergone pseudonymisation, which could
> be attributed to a natural person by the use of additional
> information should be considered to be information on an
> identifiable natural person."*

> *"To determine whether a natural person is identifiable, account
> should be taken of all the means reasonably likely to be used,
> such as singling out, either by the controller or by another
> person to identify the natural person directly or indirectly."*

> *"The principles of data protection should therefore not apply to
> anonymous information, namely information which does not relate
> to an identified or identifiable natural person or to personal
> data rendered anonymous in such a manner that the data subject is
> not or no longer identifiable. This Regulation does not therefore
> concern the processing of such anonymous information, including
> for statistical or research purposes."*

[INFERRED] from search-summary references to the EDPB and ICO: the
practical test for whether data is "anonymous enough" is
**reversibility under all means reasonably likely to be used.** A
salt that the operator holds is "reasonably likely" to be used for
re-identification, so salted hashes are pseudonymous, not anonymous.
A salt that has been destroyed (or rotated and the previous salt
discarded) is closer to anonymous, but de-anonymization through
auxiliary data (cross-correlation with other datasets) is still
possible.

[VERIFIED] **TCF v2.2** (IAB Europe, launched 16 May 2023) defines
three roles:

- **Publishers** — site/app operators collecting personal data via
  third-party vendors.
- **Vendors** — third-party companies (ad servers, DSPs, measurement
  providers) without direct end-user access.
- **CMPs** — Consent Management Platforms (cookie banners + signal
  capture).

[VERIFIED] The framework uses a **TC String** (transmitted with each
ad request) and a **Global Vendor List** (GVL). It applies *"principles
and requirements derived from"* the ePrivacy Directive and GDPR.

[INFERRED] from search summary: TCF v2.2 removed *"legitimate
interest"* as a legal basis for several personalization purposes
(Purposes 3-6). This is consistent with the EDPB's ongoing tightening
of consent enforcement.

**[UNKNOWN]:**

- Right-to-be-forgotten implementation patterns at multi-tenant
  scale — the GDPR text mandates the right but the engineering
  patterns (e.g. crypto-shredding by per-user-key, append-only
  tombstones, scheduled physical deletion) are spread across
  practitioner blogs, none of which I fetched directly. Worth a
  dedicated fetch in a follow-up research session.

---

### B.9 Aggregator + cube design

**Sources fetched (status at retrieval 2026-05-04):**

- https://cube.dev/docs/product/caching/using-pre-aggregations — 200
- https://druid.apache.org/docs/latest/design/architecture — 200
- (rollup) druid.apache.org/docs/latest/ingestion/rollup/ — fetched via
  search summary

[VERIFIED] **Cube.js pre-aggregation model:** materialized query
results that the Cube engine routes to instead of the raw source when
the query matches a known pattern. The default refresh cadence is
*"every 1 hour."* Time-based interval (`every: 12 hour`) and
SQL-condition-based refresh keys are both supported. Partitioning
with `updateWindow` enables incremental refresh of only recent
partitions.

[UNKNOWN] from the Cube.js docs as fetched: explicit guidance on
pre-aggregation idempotency or correctness semantics. The page
focuses on performance optimization mechanics rather than
transactional or consistency guarantees.

[UNKNOWN] from the Cube.js docs as fetched: late-arriving-data
handling. The `updateWindow` feature refreshes trailing partitions
but the docs don't explain whether data arriving after a partition
"closes" is backfilled or accepted in-place.

[VERIFIED] **Druid rollup definition** (search summary 2026-05-04
from druid.apache.org/docs/latest/ingestion/rollup/):

> *"Druid can roll up data at ingestion time to reduce the amount of
> raw data to store on disk, and rollup is a form of summarization
> or pre-aggregation."*

> *"When rollup is enabled by default, Druid combines into a single
> row any rows that have identical dimension values and timestamp
> values after queryGranularity-based truncation."*

[VERIFIED] **Perfect vs best-effort:** perfect rollup requires a
preprocessing scan to determine intervals + partitioning before
ingestion. Best-effort rollup parallelizes ingestion without that
shuffle, accepting that *"multiple segments might contain rows with
the same timestamp and dimension values."*

[VERIFIED] **Tradeoff:** *"as a trade-off for the efficiency of
rollup, you lose the ability to query individual events."*

**Watermarks for late-arriving events:**

[UNKNOWN] from a primary source in this research session. The
canonical reference for stream-processing watermarks is Apache Flink
/ Apache Beam documentation, which I did not fetch in this round.
Conceptually: a watermark is a monotonically advancing timestamp that
asserts *"no event with timestamp ≤ watermark will arrive in the
future."* Aggregation outputs are committed when the watermark
passes the window. Beam's "lateness allowed" parameter accepts events
that arrive after the watermark up to a configured threshold; beyond
that, they go to a side output (the "late events" stream).

---

### B.10 Observability for analytics pipelines

**Sources fetched (status at retrieval 2026-05-04):**

- Honeycomb SLO docs (search summary 2026-05-04 — direct fetch not
  done in this session)
- Multiple secondary blog summaries via WebSearch

[VERIFIED] from Honeycomb search summary: **event-based SLOs evaluate
each event to true/false/null** (goal met / goal not met / not
applicable). This contrasts with metric-based SLOs that aggregate
indicators over time windows. The advantage: every error budget burn
is traceable to specific events.

[INFERRED] from secondary sources (dqlabs, hackernoon, datagalaxy): the
canonical data-pipeline observability metrics cluster into:

- **Freshness drift** — events arriving later than the SLO window.
- **Volume drift** — record counts deviating from baseline.
- **Schema drift** — column-count or type changes.
- **Statistical/value drift** — mean/median/cardinality of values
  deviating from a learned baseline.

[INFERRED] from search summary: standard tooling categories include
test frameworks (Great Expectations, dbt tests) for assertions in
code, and platforms (Monte Carlo et al.) for pre-built freshness /
volume / schema-drift monitors with anomaly detection.

**[UNKNOWN]:**

- Specific Lyft data-quality blog posts — I did not fetch these
  directly. The prompt named "Lyft's data quality posts" as a
  source. Worth a dedicated session.
- Concrete SLO targets used by analytics teams at scale (e.g.
  Honeycomb's own internal SLO numbers for their query engine).

---

### B.11 Multi-tenant isolation patterns

**Sources fetched (200 at retrieval 2026-05-04):**

- https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html
- https://www.citusdata.com/blog/2023/07/18/citus-12-schema-based-sharding-for-postgres/
  (Marco Slot, July 18 2023)

[VERIFIED] **AWS SaaS Lens — three canonical models:**

- **Silo:** *"tenants are provided dedicated resources... each tenant
  of your system has a fully independent infrastructure stack. Or,
  perhaps each tenant of your system has a separate database."*
  Even with dedicated resources, the silo *"still relies on a shared
  identity, onboarding, and operational experience."*

- **Pool:** *"tenants share resources. This is the more classic
  notion of multi-tenancy where tenants rely on shared, scalable
  infrastructure to achieve economies of scale."*

- **Bridge:** *"acknowledge[s] the reality that SaaS businesses
  aren't always exclusively silo or pool. Instead, many systems have
  a mixed mode where some of the system is implemented in a silo
  model and some is in a pooled model... regulatory profile of a
  service's data and its noisy neighbor attributes might steer a
  microservice to a silo model."*

[VERIFIED] **Citus 12 (July 2023) — schema-based vs row-based**
sharding tradeoff (Marco Slot, verbatim):

> *"If you have a smaller number of large tenants (B2B), and some
> require a custom table definition or permissions, then schema-based
> sharding is also a great fit. If you have a very large number of
> small tenants (B2C) and want to simplify schema management and
> cross-tenant queries, then row-based sharding is likely to be a
> better fit."*

| Aspect | Schema-based | Row-based |
|---|---|---|
| Tenant scale | 1-10K tenants | 100-1M+ tenants |
| Data modeling | No special requirements | Requires tenant ID column on all tables, all FK/PK |
| Cross-tenant queries | Not supported | Yes, parallelized |
| Custom schemas | Per-tenant variations allowed | Uniform table definitions only |

[INFERRED] from Citus blog and AWS Lens taken together: **Bedfront
uses the row-based / pool pattern with `tenantId` columns** (per
admin/CLAUDE.md). At Bedfront's targeted 10K-tenant scale, that's
right in Citus's "row-based" sweet spot. The Lens' "bridge" pattern
would map to a future scenario where, e.g., a high-tier tenant gets a
dedicated Inngest concurrency budget while pool tenants share.

**[UNKNOWN]:**

- Specific query-performance benchmarks at 10K+ tenants on shared
  Postgres. Citus references performance as a benefit but exact
  multi-tenant benchmarks were not fetched in this session.
- Per-tenant data-purge patterns at scale (cascade-delete by
  `tenantId`, crypto-shredding, separate-schema-drop). Worth a
  dedicated fetch — RTBF requirements force this question.

---

### B.12 Cost modeling at scale

**Sources fetched (status at retrieval 2026-05-04):**

- https://benchmark.clickhouse.com/ — 200, ClickBench landing page
- BigQuery pricing — search summary
- Snowflake pricing — search summary

[VERIFIED] **ClickBench positioning** (clickhouse.com/benchmark):
benchmark for analytical DBMS measuring combined performance, cold
run / hot run / load time / storage size. Filterable across system
type, machine/cluster size, open-source vs proprietary, hardware
(CPU/GPU), tuned vs untuned.

[VERIFIED] **BigQuery storage pricing** (multiple secondary sources
confirming 2026 numbers):

- Active storage: **$20 per TB-month** ($0.02/GB-month) for data
  modified within 90 days.
- Long-term storage: **$10 per TB-month** ($0.01/GB-month) — 50%
  discount on data unmodified for 90+ consecutive days.
- First 10 GB/month free.
- Compute model: on-demand (per-TB-scanned) OR slot reservation
  (committed monthly capacity). Specific numbers vary by region.

[VERIFIED] **Snowflake storage pricing** (search summary 2026):

- AWS US East on-demand: **$40 per TB-month**.
- Capacity / pre-paid accounts: **~$23 per compressed TB-month**.
- Storage measured as daily-average compressed bytes including
  table data, staged files, time-travel + fail-safe history.
- Compute: virtual warehouses consume credits at $2.00–$6.00 each
  depending on edition (Standard / Enterprise / Business Critical /
  VPS). Per-second billing with 60-second minimum.

**Storage projection for Bedfront's `analytics.event` outbox:**

[INFERRED] from rough math (no Bedfront-specific source):
1.2M events/day/tenant worst-case × 10K tenants × 365 days = 4.4
trillion events/year. At a Postgres-row-with-jsonb cost of ~500
bytes/row inkl. index, that's ~2.2 PB/year. Hot Postgres storage at
~$0.20-$0.30/GB-month makes this prohibitive (~$5M-$8M/year on
storage alone). Cold-tier strategy (BigQuery long-term, S3 Glacier)
is required at fleet scale. Bedfront's daily_metric pre-aggregation
pattern collapses this to ~365M rows/year fleet-wide (~55 GB/year per
recon §6.6) — that's the right shape for a per-tenant aggregator
output table; raw events still need a tiered storage plan if we want
to retain them for ad-hoc queries.

**[UNKNOWN]:**

- Specific industry numbers on raw-event-retention tradeoff (when do
  you drop raw and keep only aggregates?). Each company's answer
  depends on regulatory requirements (RTBF window) and analytical
  needs (model retraining, ad-hoc audit). Search did not produce a
  Shopify-grade primary source on this in the session.

---

## C. Specific Shopify analytics-stack details

This section consolidates everything I could primary-source about
Shopify's actual implementation. The picture is partial — Shopify's
own engineering blog gives detailed architectural sketches but
doesn't expose the merchant-dashboard query layer in the same depth
as, say, the data-warehouse layer.

### What is VERIFIED about Shopify's stack

| Component | Role | Source |
|---|---|---|
| **Kafka** | Message bus / event spine | reliably-scale-data-platform (Dec 2020) |
| **Monorail** | Schema-abstraction layer over Kafka with versioning | real-time-buyer-signal-data-pipeline (Dec 2021) |
| **Debezium + Kafka Connect** | CDC from MySQL monolith into Kafka compacted topics | capturing-every-change (March 2021) |
| **Confluent Schema Registry** | Schema management for CDC streams | capturing-every-change (March 2021) |
| **Starscream** | PySpark-based pipeline platform (built Jan 2014) | build-production-grade-workflow-sql-modelling (Nov 2020) |
| **Seamster** | dbt + BigQuery for SQL-style reporting | same |
| **BigQuery** | Central data warehouse | same; in-context analytics article |
| **Apache Beam on Cloud Dataflow** | Real-time enrichment / aggregation jobs | real-time-buyer-signal-data-pipeline |
| **Reportify** | Merchant-facing query service | reliably-scale-data-platform |
| **Longboat** | Batch-ingestion service / older query-based CDC (being replaced) | reliably-scale-data-platform (Dec 2020) and capturing-every-change (March 2021) |
| **Speedboat** | Companion ingestion service | reliably-scale-data-platform |
| **ShopifyQL** | Commerce-tailored query language for merchants | shopify-commerce-data-querying-language-shopifyql (June 2022) |
| **Lambda architecture** | Batch-first, streaming-overlay for in-context analytics | shopify-in-context-analytics (May 2021) |

### Scale numbers VERIFIED in Shopify primary sources

- 880 billion MySQL records / month average (Dec 2020)
- 1.75 trillion Kafka messages / month average (Dec 2020)
- 65,000 records/sec average BFCM 2020 CDC throughput, spikes to
  100K (March 2021)
- p99 < 10s end-to-end for CDC (March 2021)
- 400 TB+ CDC data in Kafka cluster (March 2021)
- Starscream: 76,000 jobs/day, 300 TB/day write (Nov 2020)
- BFCM 2020: 150% throughput increase; $5.1B+ in sales across 175+
  countries

### What is INFERRED (from secondary sources only)

- The "66M Kafka messages/sec peak" number circulates in third-party
  recaps but I could not locate it in a Shopify-authored primary
  source during this research session.
- The "Starscream as old column-store" framing in the prompt is
  contradicted by Shopify's own Nov 2020 article — Starscream is a
  PYSPARK-BASED PIPELINE, not a column store. Same for Longboat
  (ingestion / old CDC).

### What is UNKNOWN

- **The actual column store / OLAP engine behind merchant analytics
  beyond BigQuery.** ShopifyQL is documented as a query language, the
  data is in BigQuery, but whether merchant-facing dashboards hit
  BigQuery directly OR a specialized OLAP engine for low-latency
  reads is not stated in the articles I fetched.
- **Per-tenant isolation strategy at the dashboard query layer.**
  Reportify is named but its tenant-isolation model is not described
  publicly.
- **Schema language for Monorail** (Avro? JSON Schema? Protobuf?
  Proprietary?). Not in primary sources I fetched.
- **Storage retention windows** — how long do raw events live in
  Kafka? In BigQuery? Not in the articles I read.
- **Disaster recovery for the data layer** at the same depth as PMS
  reliability docs — not public.
- **Cost figures** at any layer — not public.

---

## D. Comparison framework — questions to ask of any "Shopify-grade"
analytics stack

**[INFERRED-frame, VERIFIED-evidence]** — These questions are my
synthesis (the framing) but each one cites the §B subsection where
the underlying pattern was verified. Use these in the internal
audit. 28 questions across 8 domains:

### D.1 Schema governance (4)

1. Is every event declared in a schema-registry the emitter and
   reader BOTH consult? (Snowplow Iglu, Segment Protocols, Shopify
   Monorail all enforce this.)
2. Are schema changes versioned with a SchemaVer-style scheme that
   distinguishes breaking from non-breaking? (Snowplow MODEL/
   REVISION/ADDITION; Stripe API-version-per-endpoint.)
3. Is naming convention enforced (Object-Action / Noun + Past-Tense
   Verb) and consistent across emitters? (Amplitude playbook.)
4. Does the schema language carry typing constraints richer than the
   wire format (regex, ranges, allowed values)? (Segment Protocols
   tracking-plan supports regex on string properties.)

### D.2 Pipeline reliability (5)

5. Is the dual-write problem solved (outbox or CDC) at every emit
   site? (Chris Richardson canonical outbox pattern.)
6. Are failed events routed to a separate stream/table, with the
   pipeline non-lossy by design? (Snowplow good/bad event pattern.)
7. Is there a documented retry ladder with explicit limits and a
   dead-letter outcome? (Stripe: 3-day retry with exponential
   backoff. Bedfront: 5-step PMS ladder.)
8. Is event deduplication idempotent on (provider, event_id) across
   all consumers? (Stripe: log event IDs you've processed.)
9. Does the emitter NEVER trust its in-memory queue? Persisted-
   before-processing is the rule. (Bedfront PMS inbox; Kafka outbox
   pattern.)

### D.3 Privacy + compliance (4)

10. Are pseudonymized fields treated as personal data under GDPR
    Recital 26, with retention/RTBF/consent flows applied? (EDPB
    pseudonymisation guidelines.)
11. Is consent gated at the emit site, not at the reader? (TCF v2.2
    publisher role.)
12. Is there a salt-rotation / crypto-shredding mechanism for
    "wipe my history" requests, and is the rotation distinguishable
    in audit logs?
13. Is geo-lookup consent-gated at collection time, with city-level
    or coarser granularity to avoid tripping PII thresholds?

### D.4 Observability + SLOs (4)

14. Is every emit→drain→aggregate stage covered by a per-event SLI
    that evaluates true/false/null per request? (Honeycomb event-
    based SLO model.)
15. Are there explicit SLOs on freshness, accuracy, completeness
    with documented error budgets?
16. Is schema-drift monitored at the value level (cardinality,
    null rate, distribution) not just the structural level?
17. Is end-to-end tracing wired through the full pipeline so a
    failed downstream metric can be traced back to a specific
    upstream event?

### D.5 Scalability + cost (4)

18. Is the storage strategy tiered (hot/warm/cold) with explicit
    retention windows per tier?
19. Is pre-aggregation used to defer the OLAP-DB decision, with a
    documented "graduation criterion" for when to migrate?
20. Are query patterns known well enough that pre-aggregation can
    cover dashboard reads, or are we relying on raw-event scans for
    interactive UX?
21. Does the cost model project storage and compute at 1×, 10×, 100×
    current scale, with explicit cost-per-tenant?

### D.6 Multi-tenant isolation (3)

22. Is the AWS SaaS Lens classification (silo / pool / bridge)
    explicitly chosen and documented per service?
23. At our targeted tenant count, is row-based-with-tenant_id (Citus
    row-based) the right shape? Or are we approaching a number where
    schema-based or silo would be safer? (Citus: 1-10K = schema-
    based, 100K-1M+ = row-based.)
24. Does every analytics query carry a literal tenant_id filter,
    enforced by static analysis (verifier)? (Bedfront verifier
    check #10 already does this.)

### D.7 Data quality (2)

25. Is there a mechanism to detect when an event's schema validates
    but its values diverge from historical distribution? (Drift
    monitoring beyond schema.)
26. Are sampling and bias-of-omission accounted for in derived
    metrics — e.g. consent-driven absence of cart_started events
    skews funnel rates downward.

### D.8 Disaster recovery (2)

27. Is there a runbook for "the analytics pipeline was down for N
    hours; how do we backfill?" — and has it been tested in a
    non-production environment?
28. Are aggregator outputs idempotent under re-run, so backfill is a
    matter of re-running the aggregator over the affected window
    rather than a custom one-shot job? (Bedfront: composite-unique
    upsert achieves this for Phase 5A.)

---

## E. Reading list (sorted by importance to a Shopify-grade audit)

All URLs verified live (HTTP 200) at retrieval 2026-05-04 unless
otherwise noted.

1. **Capturing Every Change From Shopify's Sharded Monolith** —
   John Martin & Adam Bellemare, March 2021. Detailed primary source
   on Shopify's CDC architecture (Debezium, Kafka, Confluent Schema
   Registry) at scale (400 TB+, p99 < 10s, 65K records/sec average).
   https://shopify.engineering/capturing-every-change-shopify-sharded-monolith

2. **How to Reliably Scale Your Data Platform for High Volumes** —
   Arbab Ahmed & Bruno Deszczynski, December 2020. The clearest
   Shopify-authored overview of the data-platform architecture
   (Longboat, Speedboat, Reportify, BFCM scale). Names the tiered
   reliability + SLO discipline.
   https://shopify.engineering/reliably-scale-data-platform

3. **Building a Real-time Buyer Signal Data Pipeline for Shopify
   Inbox** — Ashay Pathak & Selina Li, December 2021. Best primary
   source on Monorail (Shopify's Kafka schema-abstraction layer) and
   how it pairs with Apache Beam on Cloud Dataflow.
   https://shopify.engineering/real-time-buyer-signal-data-pipeline-shopify-inbox

4. **Iglu — SchemaVer (Snowplow docs)**. Canonical
   MODEL-REVISION-ADDITION versioning scheme for schemas. The
   non-SemVer separator (`-` vs `.`) is intentional.
   https://docs.snowplow.io/docs/api-reference/iglu/common-architecture/schemaver/

5. **Snowplow — Failed events**. The good-event/bad-event pattern.
   Non-lossy pipeline, four failure categories (Collection /
   Validation / Enrichment / Loading), separate failed-events table.
   https://docs.snowplow.io/docs/understanding-your-pipeline/failed-events/

6. **GDPR Recital 26 — Not Applicable to Anonymous Data**.
   Foundational text. Pseudonymized data is personal data;
   anonymized data is not.
   https://gdpr-info.eu/recitals/no-26/

7. **Stripe — Webhooks** + **Stripe — Webhook versioning**. The
   reference for webhook delivery, signature verification, retry
   ladder, and the parallel-endpoint upgrade pattern. Stripe is the
   gold standard for "events as a public API."
   https://docs.stripe.com/webhooks
   https://docs.stripe.com/webhooks/versioning

8. **The Transactional Outbox Pattern: Transforming Real-Time Data
   Distribution at SeatGeek** — Sab Natarajan & Bosco Han, Feb 2025.
   Best 2024+ primary on outbox-vs-CDC tradeoffs with explicit
   reasoning. SeatGeek's WAL-direct variant is novel.
   https://chairnerd.seatgeek.com/transactional-outbox-pattern/

9. **Pattern: Transactional Outbox** — Chris Richardson,
   microservices.io. The canonical reference for the dual-write
   problem and the outbox pattern.
   https://microservices.io/patterns/data/transactional-outbox.html

10. **HTTP Analytics for 6M requests per second using ClickHouse** —
    Alex Bocharov / Cloudflare, March 2018. The migration story from
    Postgres-style aggregation to ClickHouse, with concrete numbers
    and tradeoffs. Anchors the high-end of what ClickHouse delivers.
    https://blog.cloudflare.com/http-analytics-for-6m-requests-per-second-using-clickhouse

11. **Pinterest's Analytics as a Platform on Druid (Part 1)** —
    Pinterest Real-Time Analytics Team, August 2021. The
    HBase→Druid migration narrative; explains why key-value can't
    serve interactive analytics at scale.
    https://medium.com/pinterest-engineering/pinterests-analytics-as-a-platform-on-druid-part-1-of-3-9043776b7b76

12. **AWS Well-Architected SaaS Lens — Silo, Pool, and Bridge
    Models**. The canonical multi-tenant isolation taxonomy.
    https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html

13. **Citus 12: Schema-based sharding for PostgreSQL** — Marco Slot,
    July 2023. The clearest explanation of when schema-based vs
    row-based sharding wins, with explicit tenant-count thresholds.
    https://www.citusdata.com/blog/2023/07/18/citus-12-schema-based-sharding-for-postgres/

14. **Apache Druid — Data rollup**. Pre-aggregation at ingestion;
    perfect vs best-effort tradeoff. Direct quote: rollup *"can
    dramatically reduce the size of data...by potentially orders of
    magnitude, though as a trade-off...you lose the ability to query
    individual events."*
    https://druid.apache.org/docs/latest/ingestion/rollup/

15. **IAB Europe — Transparency & Consent Framework**. The reference
    for consent-as-protocol in EU advertising/analytics. Defines
    Publisher / Vendor / CMP roles and the TC String wire format.
    https://iabeurope.eu/transparency-consent-framework/

---

**End of research document.**

This document is a research artifact, not an audit. Synthesis with
Bedfront's actual implementation is the next step, performed by
prompt-engineer in a separate workstream.
