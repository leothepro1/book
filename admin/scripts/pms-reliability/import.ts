#!/usr/bin/env npx tsx
/**
 * PMS Reliability — Import
 * ══════════════════════════
 *
 * Reads a JSONL snapshot (produced by export.ts) and restores rows
 * into the reliability-engine tables. Idempotent by default:
 * existing rows are left alone unless --overwrite is passed.
 *
 * Modes:
 *   (no flag)     Skip rows that already exist (safe — additive)
 *   --overwrite   Upsert every row (replaces existing by primary key)
 *   --dry-run     Report what WOULD happen without mutating anything
 *
 * Usage:
 *   cat snapshot.jsonl | npx tsx scripts/pms-reliability/import.ts
 *   npx tsx scripts/pms-reliability/import.ts --input=snapshot.jsonl
 *   npx tsx scripts/pms-reliability/import.ts --input=s.jsonl --overwrite
 *   npx tsx scripts/pms-reliability/import.ts --input=s.jsonl --dry-run
 *
 * Safety:
 *   - The default additive mode cannot destroy existing rows. You
 *     can safely run it against a live DB to "fill in" missing rows
 *     from a backup.
 *   - --overwrite is destructive. Requires an explicit confirmation
 *     prompt unless --yes is also passed (which is for CI).
 *   - All dates/buffers serialized by export.ts are revived to their
 *     native types on the way in.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { createReadStream, ReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const prisma = new PrismaClient();

// ── CLI ─────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    overwrite: { type: "boolean" },
    "dry-run": { type: "boolean" },
    yes: { type: "boolean" },
  },
  strict: false,
});

const inputPath = values.input as string | undefined;
const overwrite = Boolean(values.overwrite);
const dryRun = Boolean(values["dry-run"]);
const autoYes = Boolean(values.yes);

// Guard: --overwrite without --dry-run requires explicit confirmation.
if (overwrite && !dryRun && !autoYes) {
  console.error(
    "--overwrite will REPLACE existing rows. Add --yes to confirm, or add --dry-run to preview.",
  );
  process.exit(2);
}

// ── Input source ────────────────────────────────────────────

function inputStream(): NodeJS.ReadableStream {
  if (inputPath) return createReadStream(inputPath, { encoding: "utf8" });
  return process.stdin;
}

// ── Deserialisation (mirrors export.ts) ─────────────────────

function deserialize<T>(line: string): T {
  return JSON.parse(line, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if (typeof obj.__date === "string") return new Date(obj.__date);
      if (typeof obj.__buffer === "string")
        return Buffer.from(obj.__buffer, "base64");
      if (typeof obj.__bigint === "string") return BigInt(obj.__bigint);
    }
    return v;
  }) as T;
}

// ── Table dispatch ──────────────────────────────────────────
//
// For each table: delegate + unique-key extractor (for create-if-not-
// exists semantics) + list of fields that are part of the primary
// identifier. On --overwrite we use upsert; otherwise we try create
// and swallow P2002 collisions.

type TableHandler = {
  delegate: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    upsert: (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
  };
  /** Shape a row into the upsert where-clause (usually { id }). */
  whereFromRow: (row: Record<string, unknown>) => Record<string, unknown>;
};

const HANDLERS: Record<string, TableHandler> = {
  PmsWebhookInbox: {
    delegate: prisma.pmsWebhookInbox as unknown as TableHandler["delegate"],
    whereFromRow: (row) => ({ id: row.id }),
  },
  PmsOutboundJob: {
    delegate: prisma.pmsOutboundJob as unknown as TableHandler["delegate"],
    whereFromRow: (row) => ({ id: row.id }),
  },
  ReconciliationCursor: {
    delegate: prisma.reconciliationCursor as unknown as TableHandler["delegate"],
    whereFromRow: (row) => ({ id: row.id }),
  },
  PmsIdempotencyKey: {
    delegate: prisma.pmsIdempotencyKey as unknown as TableHandler["delegate"],
    whereFromRow: (row) => ({ id: row.id }),
  },
  SyncEvent: {
    delegate: prisma.syncEvent as unknown as TableHandler["delegate"],
    whereFromRow: (row) => ({ id: row.id }),
  },
};

// ── Row processor ───────────────────────────────────────────

type Counters = Record<
  string,
  { seen: number; inserted: number; skipped: number; updated: number; errors: number }
>;

function freshCounters(): Counters {
  const c: Counters = {};
  for (const name of Object.keys(HANDLERS)) {
    c[name] = { seen: 0, inserted: 0, skipped: 0, updated: 0, errors: 0 };
  }
  return c;
}

async function processRow(
  type: string,
  row: Record<string, unknown>,
  counters: Counters,
): Promise<void> {
  const handler = HANDLERS[type];
  if (!handler) {
    // Unknown type (e.g. __manifest trailer or future table). Skip
    // silently — this lets forward-compatibility work: an export
    // from a future schema can be imported into this code without
    // blowing up on unknown rows.
    return;
  }
  counters[type].seen++;

  // Prisma create() rejects unknown fields (extra cols). We rely on
  // export.ts serializing the exact row shape, so this should be a
  // clean match, but guard against trailing fields from future
  // schemas by deleting any we don't recognize. Safer: just let
  // Prisma reject — better loud than silent data loss.

  if (dryRun) {
    counters[type].inserted++; // dry-run assumes success
    return;
  }

  try {
    if (overwrite) {
      await handler.delegate.upsert({
        where: handler.whereFromRow(row),
        create: row,
        update: row,
      });
      counters[type].updated++;
    } else {
      await handler.delegate.create({ data: row });
      counters[type].inserted++;
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      !overwrite
    ) {
      // Already exists — safe default is to skip in additive mode.
      counters[type].skipped++;
      return;
    }
    counters[type].errors++;
    // Log the first few errors per table at info level; beyond that
    // suppress to stderr summary to avoid log floods.
    if (counters[type].errors <= 3) {
      console.error(
        `  [${type}] error on ${String(row.id ?? "?")}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  const rl = createInterface({
    input: inputStream(),
    crlfDelay: Infinity,
  });

  const counters = freshCounters();
  let totalLines = 0;
  let skippedUnknown = 0;

  console.error(
    `Importing reliability state (${
      dryRun ? "dry-run" : overwrite ? "OVERWRITE mode" : "additive mode"
    })`,
  );

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;
    totalLines++;

    let parsed: Record<string, unknown>;
    try {
      parsed = deserialize<Record<string, unknown>>(line);
    } catch (err) {
      console.error(
        `Line ${totalLines}: invalid JSON — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }

    const type = parsed.__type as string | undefined;
    if (!type) continue;
    if (type === "__manifest") continue; // trailer metadata
    if (!(type in HANDLERS)) {
      skippedUnknown++;
      continue;
    }
    delete parsed.__type;
    await processRow(type, parsed, counters);
  }

  const durationMs = Date.now() - startedAt;
  console.error(`\nImport done — ${totalLines} lines in ${durationMs}ms`);
  for (const [name, c] of Object.entries(counters)) {
    if (c.seen === 0) continue;
    console.error(
      `  ${name.padEnd(24)}  seen=${c.seen}  inserted=${c.inserted}  updated=${c.updated}  skipped=${c.skipped}  errors=${c.errors}`,
    );
  }
  if (skippedUnknown > 0) {
    console.error(`  (skipped ${skippedUnknown} rows of unknown type)`);
  }
}

main()
  .catch((err) => {
    console.error("import failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
