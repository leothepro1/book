/**
 * Inngest function registry.
 *
 * Functions are registered with the serve handler in
 * `app/api/inngest/route.ts`. Add new functions here so the route
 * picks them up automatically — keeps the route handler import list
 * stable across phases.
 */

export { drainAnalyticsOutbox } from "./drain-analytics-outbox";
export { scanAnalyticsOutbox } from "./scan-analytics-outbox";
