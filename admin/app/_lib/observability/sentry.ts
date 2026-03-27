export function setSentryTenantContext(tenantId: string, portalSlug?: string): void {
  try {
    const Sentry = require("@sentry/nextjs")
    Sentry.setTag("tenantId", tenantId)
    Sentry.setContext("tenant", { tenantId, portalSlug })
  } catch {
    // Sentry not installed — silently skip
  }
}
