/**
 * Performance badge styles and rating logic.
 * Exact Shopify thresholds for Core Web Vitals.
 */

export type PerformanceRating = "good" | "needs-improvement" | "poor";

export const PERFORMANCE_BADGE_STYLES: Record<
  PerformanceRating,
  { background: string; color: string; label: string }
> = {
  "good":              { background: "#CEFEE3", color: "#0D4D2E", label: "Bra" },
  "needs-improvement": { background: "#FFF3CD", color: "#5E4200", label: "Okej" },
  "poor":              { background: "#FED1D7", color: "#8E0B21", label: "Dålig" },
};

export const METRIC_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
} as const;

export function getRating(
  metric: keyof typeof METRIC_THRESHOLDS,
  value: number,
): PerformanceRating {
  const t = METRIC_THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

export function formatMetricValue(
  metric: keyof typeof METRIC_THRESHOLDS,
  value: number,
): string {
  if (metric === "cls") return value.toFixed(2);
  return `${Math.round(value)} millisekunder`;
}
