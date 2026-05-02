/**
 * Dev bootstrap — idempotent verify-and-heal for the dev environment.
 *
 * Runs before `next dev` to ensure the dev tenant + Mews integration +
 * accommodations are correctly set up in the local DB. Fast no-op when
 * everything is already aligned (3 DB queries, ~150ms). Self-heals any
 * drift by spawning `npm run db:seed`.
 *
 * Triggers heal:
 *   - Required env vars missing
 *   - Dev tenant absent for DEV_ORG_ID
 *   - Mews integration absent or status != active (when DEV_MEWS_DEMO_ACCESS_TOKEN set)
 *   - Stored encrypted accessToken doesn't match env (drift from buggy
 *     "Använd Mews demo-credentials" UI button or manual writes)
 *   - No accommodations synced
 *
 * The heal path runs `npm run db:seed`, which:
 *   1. Upserts dev tenant by clerkOrgId
 *   2. Encrypts and stores Mews credentials
 *   3. Spawns sync-dev-accommodations.ts to pull RoomCategories + units
 */

import { PrismaClient } from "@prisma/client";
import { createDecipheriv } from "node:crypto";
import { spawnSync } from "node:child_process";

const prisma = new PrismaClient();

const REQUIRED_ENV = ["DEV_ORG_ID", "DEV_OWNER_USER_ID", "INTEGRATION_ENCRYPTION_KEY"] as const;

function decryptAccessToken(enc: Buffer, iv: Buffer, key: string): string | null {
  try {
    const k = Buffer.from(key.slice(0, 32), "utf-8");
    const tag = enc.subarray(enc.length - 16);
    const ct = enc.subarray(0, enc.length - 16);
    const d = createDecipheriv("aes-256-gcm", k, iv, { authTagLength: 16 });
    d.setAuthTag(tag);
    const obj = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf-8"));
    return typeof obj.accessToken === "string" ? obj.accessToken : null;
  } catch {
    return null;
  }
}

type VerifyResult = { ok: true } | { ok: false; reason: string };

async function verify(): Promise<VerifyResult> {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      return { ok: false, reason: `${key} not set in .env` };
    }
  }
  const orgId = process.env.DEV_ORG_ID!;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    include: { integration: true },
  });
  if (!tenant) return { ok: false, reason: `no tenant for clerkOrgId=${orgId}` };

  const mewsToken = process.env.DEV_MEWS_DEMO_ACCESS_TOKEN?.trim();
  if (!mewsToken) {
    // Dev without Mews — tenant alone is enough.
    return { ok: true };
  }

  const i = tenant.integration;
  if (!i) return { ok: false, reason: "no TenantIntegration row" };
  if (i.provider !== "mews") return { ok: false, reason: `integration provider=${i.provider}, expected mews` };
  if (i.status !== "active") return { ok: false, reason: `integration status=${i.status}` };

  const stored = decryptAccessToken(
    Buffer.from(i.credentialsEncrypted),
    Buffer.from(i.credentialsIv),
    process.env.INTEGRATION_ENCRYPTION_KEY!,
  );
  if (stored !== mewsToken) {
    return { ok: false, reason: "stored Mews accessToken doesn't match DEV_MEWS_DEMO_ACCESS_TOKEN" };
  }

  const accCount = await prisma.accommodation.count({
    where: { tenantId: tenant.id, archivedAt: null },
  });
  if (accCount === 0) return { ok: false, reason: "no accommodations synced from PMS" };

  return { ok: true };
}

async function main() {
  const start = Date.now();
  let result: VerifyResult;
  try {
    result = await verify();
  } finally {
    await prisma.$disconnect();
  }

  if (result.ok) {
    console.log(`✓ Dev environment ready (${Date.now() - start}ms)`);
    return;
  }

  console.log(`▸ Dev environment needs healing: ${result.reason}`);
  console.log(`▸ Running 'npm run db:seed' to align...`);

  const r = spawnSync("npm", ["run", "db:seed"], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`✗ Bootstrap failed — db:seed exited with code ${r.status}`);
    process.exit(1);
  }
  console.log(`✓ Dev environment healed in ${Date.now() - start}ms`);
}

main().catch((e) => {
  console.error("✗ Dev bootstrap error:", e?.message ?? e);
  process.exit(1);
});
