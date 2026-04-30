/**
 * Analytics pipeline service tiers.
 *
 * Tiers classify the operational expectations of every analytics-pipeline
 * service. They drive on-call coverage, alerting thresholds, and SLO targets.
 * The human-readable description of what each tier means in Bedfront's
 * context — and which services Phase 1+ classifies into each — lives in
 * docs/analytics/tiers.md. We deliberately do NOT ship a service-name → tier
 * registry in code yet: the canonical service names won't be known until
 * Phase 1+ has concrete services to classify (drainer, aggregator, query
 * service, …). Adding speculative entries now would lock in guesses.
 */

export enum ServiceTier {
  /** Critical externally — merchants depend on this in real-time. */
  TIER_1 = 1,
  /** Critical internally — operational/business-critical. */
  TIER_2 = 2,
  /** Valuable internally — internal tools, async workflows. */
  TIER_3 = 3,
  /** Experiment / disposable. */
  TIER_4 = 4,
}

export interface ServiceTierMetadata {
  tier: ServiceTier;
  description: string;
  /** e.g. "99.95%" */
  uptimeSLO: string;
  /** e.g. "5 minutes" — for data services. Optional: query services don't have freshness. */
  freshnessSLO?: string;
  /** e.g. "p99 < 200ms" — for query services. Optional: pipeline services don't expose latency to merchants. */
  latencySLO?: string;
  oncallRequired: boolean;
}
