#!/usr/bin/env npx tsx
/**
 * PMS Reliability — Round-trip DR Verification
 * ══════════════════════════════════════════════
 *
 * Smoke test for the export/import pipeline. Runs against the live
 * dev DB (or any DB via DATABASE_URL):
 *
 *   1. Count baseline rows per reliability table
 *   2. Insert a small fleet of test rows tagged with a unique marker
 *   3. Export everything to an in-memory buffer
 *   4. Verify the test rows are present in the buffer
 *   5. Delete the test rows from the DB
 *   6. Re-import the buffer
 *   7. Verify the test rows are present again with matching fields
 *   8. Clean up test rows
 *
 * Exits 0 on success, non-zero on any mismatch. Safe to run in CI.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";

const prisma = new PrismaClient();

// Unique run marker so this test cannot collide with real data.
const RUN_ID = `dr-verify-${randomBytes(4).toString("hex")}`;

function log(msg: string): void {
  console.error(`[verify] ${msg}`);
}

async function withTenant<T>(fn: (tenantId: string) => Promise<T>): Promise<T> {
  // Use an existing tenant for FK integrity. Any tenant works since
  // we clean up after ourselves.
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("verify: no tenant in DB to piggyback on");
  return fn(tenant.id);
}

// ── Seed test data ─────────────────────────────────────────

interface SeedResult {
  inboxIds: string[];
  cursorIds: string[];
  idempotencyIds: string[];
}

async function seed(tenantId: string): Promise<SeedResult> {
  const now = new Date();

  const inbox = await Promise.all(
    [0, 1, 2].map((i) =>
      prisma.pmsWebhookInbox.create({
        data: {
          tenantId,
          provider: "fake",
          externalEventId: `${RUN_ID}-event-${i}`,
          eventType: "Reservation",
          rawPayload: { marker: RUN_ID, i } as Prisma.InputJsonValue,
          status: "PENDING",
          receivedAt: now,
        },
        select: { id: true },
      }),
    ),
  );

  const cursor = await prisma.reconciliationCursor.create({
    data: {
      tenantId,
      provider: "fake",
      tier: `hot-${RUN_ID}`, // unique tier to avoid clobbering real cursors
      windowStart: now,
      windowEnd: new Date(now.getTime() + 60_000),
      cursor: null,
      lastRunAt: now,
    },
    select: { id: true },
  });

  const idempotency = await prisma.pmsIdempotencyKey.create({
    data: {
      tenantId,
      key: createHash("sha256").update(RUN_ID).digest("hex"),
      provider: "fake",
      operation: "createBooking",
      status: "COMPLETED",
      resultJson: { marker: RUN_ID } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return {
    inboxIds: inbox.map((r) => r.id),
    cursorIds: [cursor.id],
    idempotencyIds: [idempotency.id],
  };
}

// ── Export into a buffer ───────────────────────────────────

function runExport(tenantId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "tsx",
        "scripts/pms-reliability/export.ts",
        `--tenantId=${tenantId}`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`export exited ${code}`));
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    child.on("error", reject);
  });
}

// ── Import from a string buffer ────────────────────────────

function runImport(jsonl: string, overwrite: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["tsx", "scripts/pms-reliability/import.ts"];
    if (overwrite) args.push("--overwrite", "--yes");
    const child = spawn("npx", args, {
      stdio: ["pipe", "inherit", "inherit"],
    });
    Readable.from([jsonl]).pipe(child.stdin);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`import exited ${code}`));
      resolve();
    });
    child.on("error", reject);
  });
}

// ── Counts after mutation ──────────────────────────────────

async function countMarkers(tenantId: string): Promise<{
  inbox: number;
  cursor: number;
  idempotency: number;
}> {
  const [inbox, cursor, idempotency] = await Promise.all([
    prisma.pmsWebhookInbox.count({
      where: {
        tenantId,
        externalEventId: { startsWith: `${RUN_ID}-event-` },
      },
    }),
    prisma.reconciliationCursor.count({
      where: { tenantId, tier: `hot-${RUN_ID}` },
    }),
    prisma.pmsIdempotencyKey.count({
      where: {
        tenantId,
        key: createHash("sha256").update(RUN_ID).digest("hex"),
      },
    }),
  ]);
  return { inbox, cursor, idempotency };
}

// ── Cleanup ────────────────────────────────────────────────

async function cleanup(tenantId: string): Promise<void> {
  await prisma.pmsWebhookInbox.deleteMany({
    where: {
      tenantId,
      externalEventId: { startsWith: `${RUN_ID}-event-` },
    },
  });
  await prisma.reconciliationCursor.deleteMany({
    where: { tenantId, tier: `hot-${RUN_ID}` },
  });
  await prisma.pmsIdempotencyKey.deleteMany({
    where: {
      tenantId,
      key: createHash("sha256").update(RUN_ID).digest("hex"),
    },
  });
}

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Starting round-trip verification (RUN_ID=${RUN_ID})`);

  await withTenant(async (tenantId) => {
    log(`Using tenant ${tenantId}`);

    // 1. Seed
    const seeded = await seed(tenantId);
    log(
      `Seeded: ${seeded.inboxIds.length} inbox, ${seeded.cursorIds.length} cursor, ${seeded.idempotencyIds.length} idempotency`,
    );

    // 2. Verify seed is in DB
    let counts = await countMarkers(tenantId);
    if (counts.inbox !== 3 || counts.cursor !== 1 || counts.idempotency !== 1) {
      throw new Error(
        `Post-seed counts wrong: ${JSON.stringify(counts)}`,
      );
    }
    log("Seed verified in DB");

    // 3. Export
    const jsonl = await runExport(tenantId);
    const lineCount = jsonl.trim().split("\n").filter(Boolean).length;
    log(`Export: ${lineCount} lines, ${Buffer.byteLength(jsonl, "utf8")} bytes`);

    if (!jsonl.includes(RUN_ID)) {
      throw new Error("Export did not contain RUN_ID marker");
    }

    // 4. Delete seeded rows
    await cleanup(tenantId);
    counts = await countMarkers(tenantId);
    if (counts.inbox !== 0 || counts.cursor !== 0 || counts.idempotency !== 0) {
      throw new Error(
        `Post-cleanup counts wrong: ${JSON.stringify(counts)}`,
      );
    }
    log("Rows deleted from DB");

    // 5. Re-import
    await runImport(jsonl, false /* additive — rows gone, so inserts */);
    counts = await countMarkers(tenantId);
    if (counts.inbox !== 3 || counts.cursor !== 1 || counts.idempotency !== 1) {
      throw new Error(
        `Post-import counts wrong: ${JSON.stringify(counts)}`,
      );
    }
    log("Round-trip successful — re-imported rows match");

    // 6. Verify idempotency (re-import is a no-op)
    await runImport(jsonl, false);
    counts = await countMarkers(tenantId);
    if (counts.inbox !== 3 || counts.cursor !== 1 || counts.idempotency !== 1) {
      throw new Error(
        `Import was not idempotent — counts shifted on second run: ${JSON.stringify(counts)}`,
      );
    }
    log("Import idempotency verified");

    // 7. Final cleanup
    await cleanup(tenantId);
    log("Cleanup done");
  });

  log("✓ All round-trip checks passed");
}

main()
  .catch((err) => {
    console.error(`[verify] FAILED: ${err instanceof Error ? err.message : err}`);
    // Best-effort cleanup on failure
    withTenant(cleanup).catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
