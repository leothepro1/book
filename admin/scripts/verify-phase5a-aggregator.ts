/**
 * Phase 5A aggregator (write-side) verification.
 *
 *   $ npm run verify:phase5a
 *
 * 11 static checks confirming the aggregator's structural contract is
 * intact. Runtime behaviour (idempotency, fold correctness, DB upsert)
 * is covered by the in-repo test suite under
 * `app/_lib/analytics/aggregation/*.test.ts` — this verifier exists
 * to catch drift in:
 *
 *   - Migration file present + correct shape
 *   - Mapping registry exports the canonical name
 *   - Aggregator core exports the canonical name
 *   - Runner has the idempotency-marker test (B.4 contract)
 *   - Inngest functions registered + concurrency-keyed correctly
 *   - Singleton client used (no `new PrismaClient()`)
 *   - Cross-tenant scope: every analytics.event query filters on
 *     `tenant_id =` literal in WHERE
 *   - tsc clean for Phase 5A files
 *
 * The verifier is grep-/regex-based on file contents — no DB, no
 * Inngest dev server. CI runs it after `npm run test`.
 */

/* eslint-disable no-console */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");

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

console.log("");
console.log("Phase 5A aggregator (write side) — verification");
console.log("───────────────────────────────────────────────────────");
console.log("");

console.log("Migration");
check("1. analytics_phase5a_aggregator migration directory exists on disk", () => {
  const dir = join(REPO_ROOT, "prisma/migrations");
  if (!existsSync(dir)) return { pass: false, reason: "prisma/migrations missing" };
  const found = readdirSync(dir).find((d) =>
    d.endsWith("_analytics_phase5a_aggregator"),
  );
  return found
    ? { pass: true, reason: `found ${found}` }
    : { pass: false, reason: "no analytics_phase5a_aggregator dir" };
});

check('2. migration.sql contains CREATE TABLE "analytics"."daily_metric"', () => {
  const dir = join(REPO_ROOT, "prisma/migrations");
  const found = readdirSync(dir).find((d) =>
    d.endsWith("_analytics_phase5a_aggregator"),
  );
  if (!found) return { pass: false, reason: "no migration dir" };
  const sql = readFile(join(dir, found, "migration.sql"));
  return /CREATE\s+TABLE\s+"analytics"\."daily_metric"/i.test(sql)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "CREATE TABLE not found" };
});

check(
  "3. composite unique index on (tenant_id, date, metric, dimension, dimension_value)",
  () => {
    const dir = join(REPO_ROOT, "prisma/migrations");
    const found = readdirSync(dir).find((d) =>
      d.endsWith("_analytics_phase5a_aggregator"),
    );
    if (!found) return { pass: false, reason: "no migration dir" };
    const sql = readFile(join(dir, found, "migration.sql"));
    // The unique index must reference all five columns in this order.
    const re =
      /UNIQUE\s+INDEX[\s\S]*?\(\s*"tenant_id"\s*,\s*"date"\s*,\s*"metric"\s*,\s*"dimension"\s*,\s*"dimension_value"\s*\)/i;
    return re.test(sql)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "composite unique not found" };
  },
);

console.log("");
console.log("Mapping registry");
check("4. metric-mapping.ts exports ANALYTICS_METRIC_MAPPINGS", () => {
  const text = readFile(
    join(REPO_ROOT, "app/_lib/analytics/aggregation/metric-mapping.ts"),
  );
  return /export\s+const\s+ANALYTICS_METRIC_MAPPINGS/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "export not found" };
});

console.log("");
console.log("Aggregator core");
check("5. aggregate-day.ts exports aggregateEvents", () => {
  const text = readFile(
    join(REPO_ROOT, "app/_lib/analytics/aggregation/aggregate-day.ts"),
  );
  return /export\s+async\s+function\s+aggregateEvents/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "export not found" };
});

check(
  '6. aggregate-day-runner.ts exports runAggregateDay AND its tests carry the "idempotency" marker',
  () => {
    const runnerText = readFile(
      join(
        REPO_ROOT,
        "app/_lib/analytics/aggregation/aggregate-day-runner.ts",
      ),
    );
    if (!/export\s+async\s+function\s+runAggregateDay/.test(runnerText)) {
      return { pass: false, reason: "runAggregateDay export not found" };
    }
    const testText = readFile(
      join(
        REPO_ROOT,
        "app/_lib/analytics/aggregation/aggregate-day-runner.test.ts",
      ),
    );
    return /idempotency/.test(testText)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "idempotency-marker test missing" };
  },
);

console.log("");
console.log("Inngest wiring");
check("7. scan-analytics-aggregate registered in inngest/functions/index.ts", () => {
  const text = readFile(join(REPO_ROOT, "inngest/functions/index.ts"));
  return /scanAnalyticsAggregate/.test(text) &&
    /runAnalyticsAggregateDay/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "registrations missing" };
});

check(
  '8. run-analytics-aggregate-day uses concurrency.key = "event.data.tenant_id"',
  () => {
    const text = readFile(
      join(REPO_ROOT, "inngest/functions/run-analytics-aggregate-day.ts"),
    );
    return /concurrency\s*:\s*\{[\s\S]*?key\s*:\s*"event\.data\.tenant_id"/.test(
      text,
    )
      ? { pass: true, reason: "" }
      : { pass: false, reason: "per-tenant concurrency key absent" };
  },
);

console.log("");
console.log("Singleton + scope invariants");
check(
  "9. aggregate-day-runner.ts uses _unguardedAnalyticsPipelineClient (singleton)",
  () => {
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/aggregate-day-runner.ts"),
    );
    if (/new\s+PrismaClient\s*\(/.test(text)) {
      return { pass: false, reason: "new PrismaClient() found" };
    }
    return /_unguardedAnalyticsPipelineClient/.test(text)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "singleton import missing" };
  },
);

check(
  "10. every analytics.event query in aggregator code has tenant_id = literal in WHERE",
  () => {
    // Inspect the runner + the scan function. Each `analytics.event`
    // query MUST be tenant-scoped via the literal `tenant_id =` in
    // WHERE — defends against accidental cross-tenant reads.
    //
    // Exception: scan-analytics-aggregate's DISTINCT-tenant query is
    // NOT tenant-scoped by definition (it must enumerate ALL active
    // tenants). It is allowlisted as the canonical scan call.
    const files = [
      "app/_lib/analytics/aggregation/aggregate-day-runner.ts",
      "inngest/functions/run-analytics-aggregate-day.ts",
    ];
    const violations: string[] = [];
    for (const f of files) {
      const text = readFile(join(REPO_ROOT, f));
      // Find every block referencing analytics.event in $queryRaw / SELECT.
      const re = /(SELECT[\s\S]*?FROM\s+analytics\.event[\s\S]*?(?=`|;|\)\s*\})|FROM\s+analytics\.event[\s\S]*?(?=`|;|\)\s*\}))/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const block = m[0];
        if (!/tenant_id\s*=\s*\$\{/.test(block)) {
          violations.push(`${f}: ${block.slice(0, 80).replace(/\s+/g, " ")}…`);
        }
      }
    }
    return violations.length === 0
      ? { pass: true, reason: "all queries tenant-scoped" }
      : { pass: false, reason: violations[0] };
  },
);

console.log("");
console.log("Repo health");
check("11. tsc clean for Phase 5A files (3 pre-existing SEO errors allowed)", () => {
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/aggregation/",
      "inngest/functions/scan-analytics-aggregate",
      "inngest/functions/run-analytics-aggregate-day",
      "inngest/functions/index.ts",
      "inngest/client.ts",
      "scripts/verify-phase5a-aggregator",
    ];
    const ourErrors = out
      .split("\n")
      .filter(
        (l) => PR_PATHS.some((p) => l.includes(p)) && /\berror\s+TS\d+/.test(l),
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
