/**
 * Structured Logger
 * ═════════════════
 *
 * JSON-formatted logging for observability.
 * Every payment/checkout log entry includes tenantId and orderId when available.
 */

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, string | number | boolean | null | undefined>;

export function log(level: LogLevel, event: string, ctx: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...ctx,
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
