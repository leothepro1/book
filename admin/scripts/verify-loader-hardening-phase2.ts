/**
 * Loader hardening (Phase 2 — backfill) verification.
 *
 *   $ npx tsx scripts/verify-loader-hardening-phase2.ts
 *
 * Static checks confirming Phase 2 landed:
 *   - Backfill migration exists with the expected name + SQL contents
 *   - `assertAnalyticsSaltPresent` is exported and the unit tests pass
 *   - The doc-block on tenant-settings.ts reflects Phase 2 status
 *
 * Phase 2 does NOT yet:
 *   - Tighten `analyticsSalt` to required in the type (Phase 3)
 *   - Switch default callers from `getAnalyticsSalt` to
 *     `assertAnalyticsSaltPresent` (Phase 3)
 *   - Make `getAnalyticsSalt` itself throw (Phase 3)
 *
 * The Phase 1 verifier (verify-loader-hardening.ts) must still pass after
 * Phase 2 — Phase 2 is additive. Run both back-to-back as a regression
 * gate before merging.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "prisma/migrations");
const PIPELINE_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline");

const MIGRATION_NAME = "analytics_backfill_tenant_salt";

interface CheckResult {
  pass: boolean;
  reason: string;
}
const results: Array<{ name: string; result: CheckResult }> = [];

function record(name: string, result: CheckResult): void {
  results.push({ name, result });
  const mark = result.pass ? "✓" : "✗";
  console.log(`  ${mark} ${name}${result.reason ? "  — " + result.reason : ""}`);
}

function check(name: string, fn: () => CheckResult): void {
  try {
    record(name, fn());
  } catch (err) {
    record(name, {
      pass: false,
      reason: err instanceof Error ? err.message.split("\n")[0] : String(err),
    });
  }
}

function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

function findMigrationDir(suffix: string): string | null {
  if (!existsSync(MIGRATIONS_DIR)) return null;
  const match = readdirSync(MIGRATIONS_DIR).find((d) => d.endsWith(suffix));
  return match ? join(MIGRATIONS_DIR, match) : null;
}

function containsAll(text: string, needles: string[]): { ok: boolean; missing: string[] } {
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing };
}

console.log("");
console.log("Loader hardening (Phase 2 — backfill) — verification");
console.log("───────────────────────────────────────────────────────");
console.log("");

console.log("B1 — backfill migration");
check(`1. Migration directory exists with suffix '_${MIGRATION_NAME}'`, () => {
  const dir = findMigrationDir(`_${MIGRATION_NAME}`);
  return dir
    ? { pass: true, reason: dir.split("/").pop() ?? "" }
    : { pass: false, reason: `no migration directory ending with '_${MIGRATION_NAME}'` };
});
check("2. migration.sql contains pgcrypto guard", () => {
  const dir = findMigrationDir(`_${MIGRATION_NAME}`);
  if (!dir) return { pass: false, reason: "migration directory missing" };
  const sql = readFile(join(dir, "migration.sql"));
  return /CREATE EXTENSION IF NOT EXISTS\s+"pgcrypto"/i.test(sql)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "missing CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"" };
});
check("3. migration.sql uses jsonb_set + gen_random_bytes for the UPDATE", () => {
  const dir = findMigrationDir(`_${MIGRATION_NAME}`);
  if (!dir) return { pass: false, reason: "migration directory missing" };
  const sql = readFile(join(dir, "migration.sql"));
  const { ok, missing } = containsAll(sql, [
    "jsonb_set",
    "gen_random_bytes",
    "encode(gen_random_bytes",
  ]);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing primitives: ${missing.join(", ")}` };
});
check("4. migration.sql WHERE clause covers NULL + missing + non-string + too-short", () => {
  const dir = findMigrationDir(`_${MIGRATION_NAME}`);
  if (!dir) return { pass: false, reason: "migration directory missing" };
  const sql = readFile(join(dir, "migration.sql"));
  // Each branch must be syntactically present so backfilling a partly-typed
  // setting (e.g. analyticsSalt: 123) actually overwrites the row.
  const expectedFragments = [
    `"settings" IS NULL`,
    `'analyticsSalt' IS NULL`,
    `jsonb_typeof("settings" -> 'analyticsSalt') <> 'string'`,
    `length("settings" ->> 'analyticsSalt') < 16`,
  ];
  const { ok, missing } = containsAll(sql, expectedFragments);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `WHERE missing branches: ${missing.join(", ")}` };
});
check("5. migration.sql ends with a verify DO-block that RAISEs on remaining nulls", () => {
  const dir = findMigrationDir(`_${MIGRATION_NAME}`);
  if (!dir) return { pass: false, reason: "migration directory missing" };
  const sql = readFile(join(dir, "migration.sql"));
  if (!/DO\s*\$\$/.test(sql)) {
    return { pass: false, reason: "no DO $$ block found" };
  }
  if (!/RAISE EXCEPTION/i.test(sql)) {
    return { pass: false, reason: "DO-block has no RAISE EXCEPTION" };
  }
  if (!/analytics salt backfill incomplete/i.test(sql)) {
    return { pass: false, reason: "verify-DO-block missing canonical message" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("B2 — assertAnalyticsSaltPresent helper");
check("6. assertAnalyticsSaltPresent is exported from tenant-settings.ts", () => {
  const text = readFile(join(PIPELINE_DIR, "tenant-settings.ts"));
  return text.includes("export function assertAnalyticsSaltPresent")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "export missing" };
});
check("7. assertAnalyticsSaltPresent throws with tenantId in the message", () => {
  const text = readFile(join(PIPELINE_DIR, "tenant-settings.ts"));
  // The thrown message is the platform contract — do not change it without
  // also updating Phase 3 callers and ops dashboards that grep on it.
  return /Phase 3 invariant violated;\s*tenantId=\$\{tenant\.id\}/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected `Phase 3 invariant violated; tenantId=${tenant.id}` in throw" };
});
check("8. getAnalyticsSalt remains soft (no throw) — Phase 1 contract intact", () => {
  const text = readFile(join(PIPELINE_DIR, "tenant-settings.ts"));
  // Same split-pattern the Phase 1 verifier uses, so any drift between the
  // two scripts is detected here.
  const inFunctionBody =
    text.split("export function getAnalyticsSalt")[1]?.split("export ")[0] ?? "";
  return inFunctionBody.includes("throw new")
    ? { pass: false, reason: "throw present in getAnalyticsSalt — Phase 3 work leaked into Phase 2" }
    : { pass: true, reason: "" };
});
check("9. Doc-block reflects Phase 2 status (not Phase 1)", () => {
  const text = readFile(join(PIPELINE_DIR, "tenant-settings.ts"));
  if (!/##\s*Phase\s*2/.test(text)) {
    return { pass: false, reason: "no '## Phase 2' section in doc-block" };
  }
  if (/##\s*Phase\s*1\s*\(this PR\)/.test(text)) {
    return { pass: false, reason: "stale '## Phase 1 (this PR)' header still present" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("B3 — unit tests");
check("10. tenant-settings unit tests pass (assertAnalyticsSaltPresent included)", () => {
  // Step 1: confirm the helper has a dedicated describe-block in the test
  // file. Grepping the source file is more reliable than parsing reporter
  // output across vitest versions.
  const testPath = join(PIPELINE_DIR, "tenant-settings.test.ts");
  if (!existsSync(testPath)) {
    return { pass: false, reason: "tenant-settings.test.ts missing" };
  }
  const testText = readFile(testPath);
  if (!/describe\(\s*"assertAnalyticsSaltPresent"/.test(testText)) {
    return {
      pass: false,
      reason: "no `describe('assertAnalyticsSaltPresent', ...)` block in test file",
    };
  }
  // Step 2: run the file and gate on exit code.
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/tenant-settings.test.ts",
      { cwd: REPO_ROOT, stdio: "pipe" },
    );
    return { pass: true, reason: "" };
  } catch (err) {
    return {
      pass: false,
      reason: err instanceof Error ? err.message.split("\n")[0] : String(err),
    };
  }
});

console.log("");
console.log("B4 — repo health");
check("11. tsc clean for tenant-settings + verifier (scoped check)", () => {
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/pipeline/tenant-settings",
      "scripts/verify-loader-hardening-phase2",
      "scripts/verify-loader-hardening.ts",
    ];
    const ourErrors = out
      .split("\n")
      .filter((l) =>
        PR_PATHS.some((p) => l.includes(p)) && /\berror\s+TS\d+/.test(l),
      );
    if (ourErrors.length === 0) {
      return {
        pass: true,
        reason: "pre-existing repo errors in unrelated files; scoped clean",
      };
    }
    return { pass: false, reason: ourErrors[0].trim() };
  }
});

console.log("");
const passed = results.filter((r) => r.result.pass).length;
const total = results.length;
console.log("───────────────────────────────────────────────────────");
console.log(`Result: ${passed} / ${total} checks passed`);

if (passed !== total) {
  console.log("");
  console.log("Failed checks:");
  for (const r of results) {
    if (!r.result.pass) console.log(`  ✗ ${r.name}  — ${r.result.reason}`);
  }
  process.exit(1);
}
process.exit(0);
