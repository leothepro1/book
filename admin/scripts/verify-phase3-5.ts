/**
 * Phase 3.5 verification — staging infrastructure + cleanup
 *
 *   $ npx tsx scripts/verify-phase3-5.ts
 *
 * Static + targeted-test checks. The actual staging-domain
 * activation (Vercel domain alias + Clerk org provisioning) is
 * operator territory documented in
 * docs/analytics/phase3-5-staging-setup.md and is NOT verified by
 * this script — there's no programmatic surface for those steps.
 *
 * Checks (locked target = 15 per the plan):
 *
 *   1.  Prisma migration applied — Tenant.environment field type
 *       exists in the generated client
 *   2.  Default value is "production"
 *   3.  @@index([environment]) declared in schema.prisma
 *   4.  pipeline/environment.ts exists with required header
 *   5.  PRODUCTION_TENANT_FILTER exports correctly
 *   6.  isProductionTenant() returns true for production / false for staging
 *   7.  isStagingTenant() returns true for staging / false for production
 *   8.  seed-staging-tenant.ts has the required ⚠️ sentinel-warning header
 *   9.  seed-staging-tenant.ts is idempotent — uses upsert, NOT create
 *   10. docs/analytics/phase3-5-staging-setup.md exists, non-empty
 *   11. docs/analytics/cron-staging-isolation.md exists, non-empty
 *   12. phase3-manual-smoke.md pre-flight no longer says "blocked
 *       pending staging domain"
 *   13. Pre-existing test failures resolved — full vitest shows 0
 *       fail (was 37)
 *   14. tsc clean — 0 errors (was 3)
 *   15. stash@{0} no longer references the dev-clerk-data fix
 *       (refinement H — only stash@{0}, not zero stashes globally)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const SCHEMA_PATH = join(REPO_ROOT, "prisma/schema.prisma");
const ENV_HELPER_PATH = join(
  REPO_ROOT,
  "app/_lib/analytics/pipeline/environment.ts",
);
const SEED_PATH = join(REPO_ROOT, "scripts/seed-staging-tenant.ts");
const SETUP_DOC_PATH = join(REPO_ROOT, "docs/analytics/phase3-5-staging-setup.md");
const CRON_DOC_PATH = join(
  REPO_ROOT,
  "docs/analytics/cron-staging-isolation.md",
);
const SMOKE_DOC_PATH = join(REPO_ROOT, "docs/analytics/phase3-manual-smoke.md");

// ── Result tracking ─────────────────────────────────────────────────

type CheckResult = { pass: boolean; reason: string };
const results: { name: string; result: CheckResult }[] = [];

function record(name: string, result: CheckResult): void {
  results.push({ name, result });
  const mark = result.pass ? "✓" : "✗";
  // eslint-disable-next-line no-console
  console.log(`  ${mark} ${name}${result.reason ? "  — " + result.reason : ""}`);
}

async function check(
  name: string,
  fn: () => Promise<CheckResult> | CheckResult,
): Promise<void> {
  try {
    record(name, await fn());
  } catch (err) {
    record(name, {
      pass: false,
      reason:
        "threw: " + (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
}

function ok(reason = ""): CheckResult {
  return { pass: true, reason };
}
function fail(reason: string): CheckResult {
  return { pass: false, reason };
}

function readFile(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line no-console
  console.log("Phase 3.5 verification — staging infrastructure + cleanup\n");

  // ── 1. Prisma client has TenantEnvironment type ─────────────────
  const generatedTypesPath = join(
    REPO_ROOT,
    "node_modules/.prisma/client/index.d.ts",
  );
  await check("1. Tenant.environment field generated in Prisma client", () => {
    const dts = readFile(generatedTypesPath);
    if (!dts) return fail("generated client missing — run `prisma generate`");
    return /environment:\s*\$Enums\.TenantEnvironment\b/.test(dts) ||
      /environment:\s*TenantEnvironment\b/.test(dts)
      ? ok()
      : fail("environment field not found in Tenant type");
  });

  // ── 2. Default value is production ──────────────────────────────
  const schema = readFile(SCHEMA_PATH);
  await check("2. Schema declares @default(production) on environment", () =>
    /environment\s+TenantEnvironment\s+@default\(production\)/.test(schema ?? "")
      ? ok()
      : fail("default value not production"),
  );

  // ── 3. @@index([environment]) ──────────────────────────────────
  await check("3. Schema declares @@index([environment])", () =>
    /@@index\(\[environment\]\)/.test(schema ?? "")
      ? ok()
      : fail("index missing"),
  );

  // ── 4. environment.ts exists with required header ──────────────
  const envHelper = readFile(ENV_HELPER_PATH);
  await check(
    "4. pipeline/environment.ts has the two-flag distinction header",
    () =>
      envHelper &&
      envHelper.includes("Tenant.environment") &&
      envHelper.includes("TenantIntegration.isDemoEnvironment") &&
      envHelper.includes("NOT interchangeable")
        ? ok()
        : fail("required header content missing"),
  );

  // ── 5. PRODUCTION_TENANT_FILTER export shape ───────────────────
  await check(
    "5. PRODUCTION_TENANT_FILTER exports as `as const` with correct shape",
    () =>
      envHelper &&
      /export const PRODUCTION_TENANT_FILTER =\s*{\s*environment:\s*TenantEnvironment\.production,?\s*}\s*as const/.test(
        envHelper,
      )
        ? ok()
        : fail("export shape mismatch"),
  );

  // Dynamic-import the helper once for checks 6 and 7.
  const helperMod = (await import(ENV_HELPER_PATH)) as {
    isProductionTenant: (t: { environment: string }) => boolean;
    isStagingTenant: (t: { environment: string }) => boolean;
  };

  // ── 6. isProductionTenant ──────────────────────────────────────
  await check(
    "6. isProductionTenant returns true for production / false for staging",
    () => {
      const prodOk = helperMod.isProductionTenant({ environment: "production" });
      const stagingOk = helperMod.isProductionTenant({ environment: "staging" });
      return prodOk === true && stagingOk === false
        ? ok()
        : fail(`prod=${prodOk}, staging=${stagingOk}`);
    },
  );

  // ── 7. isStagingTenant ─────────────────────────────────────────
  await check(
    "7. isStagingTenant returns true for staging / false for production",
    () => {
      const stagingOk = helperMod.isStagingTenant({ environment: "staging" });
      const prodOk = helperMod.isStagingTenant({ environment: "production" });
      return stagingOk === true && prodOk === false
        ? ok()
        : fail(`staging=${stagingOk}, prod=${prodOk}`);
    },
  );

  // ── 8. seed-staging-tenant.ts has the sentinel-warning header ─
  const seed = readFile(SEED_PATH);
  await check("8. seed has ⚠️ sentinel-warning header", () =>
    seed &&
    seed.includes("⚠️ NOT RUNNABLE WITHOUT OPERATOR ACTION FIRST") &&
    seed.includes("seed_staging_org") &&
    seed.includes("--allow-sentinel")
      ? ok()
      : fail("required header content missing"),
  );

  // ── 9. seed is idempotent — uses upsert ───────────────────────
  await check("9. seed uses prisma.*.upsert (idempotent)", () => {
    if (!seed) return fail("seed file missing");
    const upserts = (seed.match(/\.upsert\(/g) || []).length;
    const creates = (seed.match(/\bprisma\.[a-zA-Z]+\.create\(/g) || []).length;
    if (upserts < 4) {
      return fail(`expected ≥4 upsert calls (Tenant + Integration + Payment + AnalyticsConfig), got ${upserts}`);
    }
    if (creates > 0) {
      return fail(`found ${creates} bare prisma.*.create calls — should all be upsert`);
    }
    return ok(`${upserts} upsert calls, 0 bare create`);
  });

  // ── 10. setup doc exists ──────────────────────────────────────
  await check("10. phase3-5-staging-setup.md exists, non-empty", () => {
    const content = readFile(SETUP_DOC_PATH);
    return content && content.length > 1000 ? ok() : fail("missing or too short");
  });

  // ── 11. cron-staging-isolation.md exists ──────────────────────
  await check("11. cron-staging-isolation.md exists, lists ≥3 risk crons", () => {
    const content = readFile(CRON_DOC_PATH);
    if (!content) return fail("missing");
    const cronMentions = [
      "email-marketing-sync",
      "send-campaigns",
      "segment-sync",
    ];
    const found = cronMentions.filter((c) => content.includes(c));
    return found.length >= 3
      ? ok(`${found.length}/3 risk crons documented`)
      : fail(`only ${found.length}/3 risk crons named: ${found.join(", ")}`);
  });

  // ── 12. phase3-manual-smoke.md pre-flight rewritten ──────────
  await check(
    '12. phase3-manual-smoke.md pre-flight no longer says "blocked pending"',
    () => {
      const content = readFile(SMOKE_DOC_PATH);
      if (!content) return fail("smoke doc missing");
      if (content.includes("blocked pending staging domain")) {
        return fail("still contains the pre-Phase-3.5 blocker text");
      }
      if (
        !content.includes("Phase 3.5 has unblocked manual smoke") &&
        !content.includes("Pre-flight: smoke environment unblocked")
      ) {
        return fail(
          "expected new pre-flight wording referencing Phase 3.5 unblock",
        );
      }
      return ok();
    },
  );

  // ── 13. Full vitest shows 0 fail ─────────────────────────────
  await check(
    "13. full vitest run shows 0 failures (Phase 3.5 cleanup complete)",
    () => {
      try {
        const output = execSync("npm run test 2>&1", {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: "pipe",
          maxBuffer: 100 * 1024 * 1024,
        });
        // Vitest prints "X failed" when failures exist.
        const m = output.match(/Tests\s+(?:.*?)(\d+)\s+failed/);
        if (m && parseInt(m[1]!, 10) > 0) {
          return fail(`vitest reports ${m[1]} failures`);
        }
        return ok("0 failed");
      } catch (err) {
        // npm run test exits non-zero on any failure
        const stdout = (err as { stdout?: Buffer }).stdout?.toString() ?? "";
        const m = stdout.match(/Tests\s+(?:.*?)(\d+)\s+failed/);
        if (m) return fail(`vitest reports ${m[1]} failures`);
        return fail("vitest run failed; see output");
      }
    },
  );

  // ── 14. tsc clean ────────────────────────────────────────────
  await check("14. tsc clean — 0 errors", () => {
    try {
      execSync("npx tsc --noEmit 2>&1", {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
        maxBuffer: 100 * 1024 * 1024,
      });
      return ok("0 errors");
    } catch (err) {
      const stdout = (err as { stdout?: Buffer }).stdout?.toString() ?? "";
      const errorCount = (stdout.match(/error TS/g) || []).length;
      return fail(`${errorCount} tsc errors remaining`);
    }
  });

  // ── 15. stash@{0} no longer the dev-clerk-data fix ──────────
  await check(
    "15. stash@{0} no longer references dev-clerk-data robustness",
    () => {
      try {
        const list = execSync("git stash list 2>&1", {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: "pipe",
        });
        const firstLine = list.split("\n")[0] ?? "";
        if (firstLine.includes("dev-clerk-data")) {
          return fail(
            "stash@{0} still references the dev-clerk-data fix — Commit E did not pop it",
          );
        }
        return ok();
      } catch {
        return fail("could not read git stash list");
      }
    },
  );

  // ── Tally ───────────────────────────────────────────────────
  const passed = results.filter((r) => r.result.pass).length;
  // eslint-disable-next-line no-console
  console.log(`\nPhase 3.5: ${passed}/${results.length} passed`);
  if (passed < results.length) {
    // eslint-disable-next-line no-console
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.result.pass)) {
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${r.name} — ${r.result.reason}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("verify-phase3-5 unhandled error:", err);
  process.exit(2);
});
