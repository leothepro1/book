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

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
