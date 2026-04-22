#!/usr/bin/env npx tsx
/**
 * PMS Reliability — Export
 * ══════════════════════════
 *
 * Streams every row from the reliability-engine tables to stdout
 * (or a file) as JSONL. One line per row, prefixed with a `__type`
 * field identifying the source table. Cursor-paginates so memory
 * is bounded even for millions of rows.
 *
 * Usage:
 *   npx tsx scripts/pms-reliability/export.ts > snapshot.jsonl
 *   npx tsx scripts/pms-reliability/export.ts --tenantId=cmo8... > tenant.jsonl
 *   npx tsx scripts/pms-reliability/export.ts --since=2026-04-01 > recent.jsonl
 *   npx tsx scripts/pms-reliability/export.ts --output=/tmp/snap.jsonl
 *
 * Flags:
 *   --tenantId=<id>   Only export rows for this tenant
 *   --since=<ISO>     Only rows with createdAt >= this timestamp
 *   --until=<ISO>     Only rows with createdAt <  this timestamp
 *   --output=<path>   Write to file instead of stdout
 *   --tables=<list>   Comma-separated allowlist (default: all)
 *
 * This is the backup complement to Neon's built-in PITR: PITR
 * handles "restore the whole DB to a moment in time"; this script
 * handles "extract the reliability state specifically, so it can be
 * reviewed, diffed, shared, or replayed into another environment".
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { createWriteStream, WriteStream } from "node:fs";
import { parseArgs } from "node:util";

const prisma = new PrismaClient();

// ── CLI argument parsing ────────────────────────────────────

const { values } = parseArgs({
  options: {
    tenantId: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
    output: { type: "string" },
    tables: { type: "string" },
  },
  strict: false,
});

const tenantId = values.tenantId as string | undefined;
const since = values.since ? new Date(values.since as string) : undefined;
const until = values.until ? new Date(values.until as string) : undefined;
const outputPath = values.output as string | undefined;
const tablesFilter =
  typeof values.tables === "string"
    ? new Set(
        values.tables
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

if (since && Number.isNaN(since.getTime())) {
  console.error(`Invalid --since date: ${values.since}`);
  process.exit(2);
}
if (until && Number.isNaN(until.getTime())) {
  console.error(`Invalid --until date: ${values.until}`);
  process.exit(2);
}

// ── Output sink ─────────────────────────────────────────────

const out: WriteStream | NodeJS.WriteStream = outputPath
  ? createWriteStream(outputPath, { encoding: "utf8" })
  : process.stdout;

function write(line: string): void {
  out.write(line + "\n");
}

// ── JSON-safe serialisation ─────────────────────────────────
//
// Prisma returns Date objects and Decimal instances that don't
// survive JSON.stringify round-tripping. We normalise here so the
// import script can trust the shape.

function serialize(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_k, v) => {
    if (v instanceof Date) return { __date: v.toISOString() };
    if (v instanceof Buffer) return { __buffer: v.toString("base64") };
    if (typeof v === "bigint") return { __bigint: v.toString() };
    return v;
  });
}

// ── Table extractors ────────────────────────────────────────
//
// Each extractor streams its table via Prisma cursor pagination.
// The WHERE clause is composed from the CLI filters. Every row is
// tagged with `__type` so the import script dispatches correctly.

const PAGE_SIZE = 500;

interface ExtractorSpec {
  name: string;
  /** Prisma delegate (e.g. prisma.pmsWebhookInbox) */
  model: {
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  /** Field names that exist on the model for tenant/date filtering */
  supportsTenantId: boolean;
  dateField: string | null; // e.g. "createdAt" or "receivedAt"; null = no date filter
}

function buildWhere(spec: ExtractorSpec): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (tenantId && spec.supportsTenantId) where.tenantId = tenantId;
  if (spec.dateField && (since || until)) {
    const range: Record<string, Date> = {};
    if (since) range.gte = since;
    if (until) range.lt = until;
    where[spec.dateField] = range;
  }
  return where;
}

const TABLES: ExtractorSpec[] = [
  {
    name: "PmsWebhookInbox",
    model: prisma.pmsWebhookInbox as unknown as ExtractorSpec["model"],
    supportsTenantId: true,
    dateField: "receivedAt",
  },
  {
    name: "PmsOutboundJob",
    model: prisma.pmsOutboundJob as unknown as ExtractorSpec["model"],
    supportsTenantId: true,
    dateField: "createdAt",
  },
  {
    name: "ReconciliationCursor",
    model: prisma.reconciliationCursor as unknown as ExtractorSpec["model"],
    supportsTenantId: true,
    dateField: "createdAt",
  },
  {
    name: "PmsIdempotencyKey",
    model: prisma.pmsIdempotencyKey as unknown as ExtractorSpec["model"],
    supportsTenantId: true,
    dateField: "firstSeenAt",
  },
  {
    name: "SyncEvent",
    model: prisma.syncEvent as unknown as ExtractorSpec["model"],
    supportsTenantId: true,
    dateField: "createdAt",
  },
];

async function extractTable(spec: ExtractorSpec): Promise<number> {
  if (tablesFilter && !tablesFilter.has(spec.name)) return 0;

  const where = buildWhere(spec);
  const total = await spec.model.count({ where });
  let cursor: string | undefined = undefined;
  let written = 0;

  while (true) {
    const page = await spec.model.findMany({
      where,
      take: PAGE_SIZE,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;

    for (const row of page) {
      write(serialize({ __type: spec.name, ...row }));
      written++;
    }
    cursor = page[page.length - 1].id as string;
    if (page.length < PAGE_SIZE) break;
  }

  // Status line to stderr so stdout stays clean for piping.
  console.error(`  ${spec.name}: ${written}/${total} rows`);
  return written;
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  const filterDesc = [
    tenantId ? `tenant=${tenantId}` : "all tenants",
    since ? `since=${since.toISOString()}` : null,
    until ? `until=${until.toISOString()}` : null,
    tablesFilter ? `tables=${[...tablesFilter].join("|")}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  console.error(`Exporting reliability state (${filterDesc})`);

  let grandTotal = 0;
  for (const spec of TABLES) {
    grandTotal += await extractTable(spec);
  }

  // Trailer line — makes partial/truncated exports detectable.
  write(
    JSON.stringify({
      __type: "__manifest",
      exportedAt: new Date().toISOString(),
      total: grandTotal,
      filter: { tenantId, since, until, tables: [...(tablesFilter ?? [])] },
    }),
  );

  if (out !== process.stdout) {
    await new Promise<void>((resolve) => (out as WriteStream).end(resolve));
  }

  const durationMs = Date.now() - startedAt;
  console.error(`Done — ${grandTotal} rows in ${durationMs}ms`);
}

main()
  .catch((err) => {
    console.error("export failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
