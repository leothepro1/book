import { PrismaClient } from "@prisma/client";
import { log } from "@/app/_lib/logger";

// ── Connection URL ───────────────────────────────────────────

function isPooledUrl(url: string): boolean {
  return url.includes("-pooler.");
}

function getDatabaseUrl(): string {
  // In dev, prefer DIRECT_URL (no PgBouncer). Pooler in dev gains nothing
  // and surfaces "Server has closed the connection" when Neon cycles
  // compute. Production still uses the pooled URL with pgbouncer=true.
  const url =
    process.env.NODE_ENV === "development"
      ? process.env.DIRECT_URL ?? process.env.DATABASE_URL
      : process.env.DATABASE_URL;

  if (!url) {
    throw new Error("[db] DATABASE_URL is required but not set.");
  }

  const separator = url.includes("?") ? "&" : "?";
  const params: string[] = [];

  if (isPooledUrl(url)) {
    if (!url.includes("pgbouncer")) params.push("pgbouncer=true");
    if (!url.includes("connect_timeout")) params.push("connect_timeout=10");
    if (!url.includes("statement_timeout")) params.push("statement_timeout=30000");
  } else if (process.env.NODE_ENV !== "development") {
    if (!url.includes("connection_limit")) params.push("connection_limit=10");
    if (!url.includes("pool_timeout")) params.push("pool_timeout=20");
    if (!url.includes("statement_timeout")) params.push("statement_timeout=30000");
  }

  return params.length > 0 ? `${url}${separator}${params.join("&")}` : url;
}

// ── Client ───────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const client = new PrismaClient({
    log: isDev
      ? [
          { level: "error", emit: "event" },
          { level: "warn", emit: "event" },
          { level: "query", emit: "event" },
        ]
      : [
          { level: "error", emit: "event" },
          { level: "warn", emit: "event" },
        ],
    datasources: { db: { url: getDatabaseUrl() } },
    transactionOptions: {
      timeout: 30_000,
      maxWait: 5_000,
    },
  });

  // ── Structured event logging ─────────────────────────────

  client.$on("error" as never, (e: { message: string; target: string }) => {
    log("error", "prisma.error", { message: e.message, target: e.target });
  });

  client.$on("warn" as never, (e: { message: string; target: string }) => {
    log("warn", "prisma.warn", { message: e.message, target: e.target });
  });

  if (isDev) {
    client.$on("query" as never, (e: { duration: number; query: string }) => {
      if (e.duration > 1000) {
        log("warn", "prisma.slow_query", {
          duration: e.duration,
          query: e.query,
        });
      }
    });
  }

  return client;
}

const baseClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = baseClient;

// ── Analytics pipeline dev guard ─────────────────────────────
//
// The new analytics pipeline (Phase 0+) has three models that must only be
// accessed through the withTenant() helper in app/_lib/analytics/pipeline/tenant.ts.
// Direct prisma.analyticsPipelineEvent.* calls would bypass tenant scoping and
// silently leak data across tenants — exactly the failure mode withTenant
// exists to prevent.
//
// In dev, we wrap the exported `prisma` so direct access throws with a pointer
// to the helper. In production, this guard is hard-coded inert regardless of
// the env flag value — the cost of a false positive in prod is too high for a
// runtime that's already fronted by integration tests and the verify script.
//
// withTenant() imports `_unguardedAnalyticsPipelineClient` directly, sidestepping
// this guard. That is the only intended caller; nothing else should touch it.

const ANALYTICS_PIPELINE_MODELS = [
  "analyticsPipelineEvent",
  "analyticsPipelineOutbox",
  "analyticsPipelineTenantConfig",
] as const;

function shouldEnableAnalyticsDevGuard(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const flag = process.env.ANALYTICS_PIPELINE_DEV_GUARD;
  // Default ON in development when the flag is unset.
  if (flag === undefined) return process.env.NODE_ENV === "development";
  return flag === "1";
}

function buildDevGuardedClient(client: PrismaClient) {
  const guard = {
    async $allOperations({ model, operation }: { model: string; operation: string }) {
      throw new Error(
        `[analytics-pipeline] direct access to prisma.${model}.${operation} is forbidden. ` +
          `Use withTenant(tenantId, async (db) => db.${model}.${operation}(...)) ` +
          `from app/_lib/analytics/pipeline/tenant.ts. ` +
          `To disable this guard locally, set ANALYTICS_PIPELINE_DEV_GUARD=0.`,
      );
    },
  };
  return client.$extends({
    query: {
      analyticsPipelineEvent: guard,
      analyticsPipelineOutbox: guard,
      analyticsPipelineTenantConfig: guard,
    },
  });
}

/**
 * Internal handle for app/_lib/analytics/pipeline/tenant.ts only.
 *
 * Bypasses the dev guard above. Do not import this anywhere else — every other
 * consumer of the pipeline models must go through withTenant().
 */
export const _unguardedAnalyticsPipelineClient = baseClient;

// ── Why we cast the export to PrismaClient ────────────────────────────────
//
// `buildDevGuardedClient(baseClient)` returns Prisma's `DynamicClientExtensionThis<...>`,
// the runtime-recursive generic computed by `$extends`. If the conditional below
// was left to TypeScript's natural inference, the exported `prisma` symbol would
// be the union `PrismaClient | DynamicClientExtensionThis<...>`. Every call site
// across the codebase — every `prisma.something.findFirst(...)` — would then have
// to resolve method dispatch against both arms of the union and structurally
// compare the input/output types of all 144 models. That cost is what blew the
// Vercel build's heap to 11.5 GB during `tsc --noEmit` (see PR #18 comments for
// the bisect).
//
// The dev guard's user-facing job — throwing with a pointer to withTenant() when
// pipeline models are accessed directly — is enforced by the runtime
// `$allOperations` interceptor inside `buildDevGuardedClient`. It does not
// depend on the exported value's TypeScript type. So we cast back to
// `PrismaClient` at the boundary: runtime contract preserved, cross-codebase
// type cost stays flat.
//
// The cast goes through `unknown` because `DynamicClientExtensionThis` is not
// directly assignable to `PrismaClient` (different shapes at the type level
// even though the runtime object exposes a superset of `PrismaClient`'s API).
export const prisma: PrismaClient = (shouldEnableAnalyticsDevGuard()
  ? buildDevGuardedClient(baseClient)
  : baseClient) as unknown as PrismaClient;
