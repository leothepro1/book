/**
 * analytics:parity-diff — Phase 5B feature, reserved name only.
 *
 * Phase 5A ships the aggregator write-side. Phase 5B ships parity-
 * validation between legacy `AnalyticsDailyMetric` and new
 * `analytics.daily_metric`. The full implementation will land here in
 * a separate PR; this stub reserves the npm-script name and exits with
 * a pointer to the canonical spec.
 *
 * Spec: admin/_audit/analytics-phase5a-aggregator-recon.md §7
 *   - Outer-join on (date, metric, dimension, dimension_value)
 *   - Per-(metric, dimension) tolerance (recon §7.2)
 *   - JSON report to stdout + structured log
 *   - Eventually: admin UI under /admin/analytics/parity (Phase 5B)
 *
 * §9.8 OPEN — Leo's tolerance-table sign-off blocks Phase 5B start
 * but does NOT block Phase 5A.
 */

/* eslint-disable no-console */

console.error(
  "analytics:parity-diff is a Phase 5B feature, not yet implemented.",
);
console.error(
  "See admin/_audit/analytics-phase5a-aggregator-recon.md §7 for the spec.",
);
console.error(
  "Phase 5A (aggregator write-side) ships in PR feature/analytics-phase5a-aggregator-impl.",
);
process.exit(1);
