# Analytics service tiers

Service tiers classify the operational expectations of every analytics-pipeline
service. They drive on-call coverage, alerting thresholds, and SLO targets.
The enum + interface live in `app/_lib/analytics/pipeline/tiers.ts`. This
document is the human-readable definition.

We deliberately do **not** ship a service-name → tier registry constant in
code yet. The canonical service names are defined as Phase 1+ services land
(drainer, aggregator, query service, …). Adding speculative entries now
would lock in guesses that age badly.

## What each tier means at Bedfront

### Tier 1 — Critical externally

Merchants depend on this in real-time. A degradation is visible to
end-customers (guests on a booking flow) or to merchants running their
business. Page on-call immediately.

- **Uptime SLO:** 99.95% (≈ 22 min downtime/month)
- **Freshness SLO** (if data service): 5 minutes
- **Latency SLO** (if query service): p99 < 200 ms
- **On-call:** required, 24/7
- **Bedfront examples:** booking pipeline (PMS reliability engine —
  inbound + outbound), payment pipeline (Stripe webhook + reconcile),
  OTP authentication, checkout (Order create + PaymentIntent), the
  storefront read path

### Tier 2 — Critical internally

Operational or business-critical. A degradation does not block a guest
booking or a payment, but it impairs merchants' ability to run their
business — order management, analytics dashboards, email send queue.
Page during business hours; alert on backlog after-hours.

- **Uptime SLO:** 99.9% (≈ 43 min downtime/month)
- **Freshness SLO** (if data service): 15 minutes
- **Latency SLO** (if query service): p95 < 500 ms
- **On-call:** required, business hours
- **Bedfront examples:** analytics dashboards, merchant admin UI, email
  send queue, draft-order workflow, the legacy `public.AnalyticsEvent`
  emitter (until cutover)

### Tier 3 — Valuable internally

Internal tools and async workflows. A degradation is annoying but not
business-critical — campaign automation queueing up, marketing analytics
lagging by a few hours. No paging; alert on backlog only.

- **Uptime SLO:** 99.5% (≈ 3.6 hr downtime/month)
- **Freshness SLO:** 1 hour
- **Latency SLO:** p95 < 2 s
- **On-call:** not required
- **Bedfront examples:** campaign automation (Mailchimp, Meta Ads, Google
  Ads), marketing analytics rollups, support ticket triage tooling

### Tier 4 — Experiment / disposable

Experimental features and internal labs. A degradation is acceptable; the
service can be turned off entirely without business impact. No SLO, no
on-call, no alerting beyond "it's broken" log lines.

- **Uptime SLO:** none
- **Freshness SLO:** none
- **Latency SLO:** none
- **On-call:** never
- **Bedfront examples:** experimental section types, internal labs,
  prototype dashboards, A/B-test plumbing for unreleased features

## How to assign a tier

When Phase 1+ adds a new analytics-pipeline service, decide its tier by
asking, in order:

1. Does a merchant or guest see the impact in real-time? → Tier 1
2. Does a merchant lose the ability to run a business workflow? → Tier 2
3. Does a non-critical internal workflow stall? → Tier 3
4. Otherwise → Tier 4

If it's not obvious between two tiers, pick the higher (more demanding) one.
Demoting a tier later is cheap; promoting is expensive because the new SLO
applies retroactively to incident review.

## What lives where

- The enum + interface — `app/_lib/analytics/pipeline/tiers.ts`
- This descriptive doc — `docs/analytics/tiers.md`
- Service-name → tier mapping — **not yet defined**, added per service
  starting in Phase 1
