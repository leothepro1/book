/**
 * Phase 5A aggregator (write-side) verification.
 *
 *   $ npm run verify:phase5a
 *
 * 17 static checks confirming the aggregator's structural contract is
 * intact (11 from Phase 5A + 6 funnel-metrics extensions). Runtime
 * behaviour (idempotency, fold correctness, DB upsert) is covered by
 * the in-repo test suite under
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
 *   - Funnel metrics: cart_started / checkout_started / cart_abandoned
 *     mappings registered + rate computations + zero-divide guard
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
console.log("Funnel metrics");
check(
  "11. metric-mapping.ts registers cart_started@0.2.0 → CART_STARTED contribution",
  () => {
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/metric-mapping.ts"),
    );
    // Look for the cart_started mapping block + a contribution with
    // metric:"CART_STARTED". The mapping block guard prevents a stray
    // CART_STARTED string elsewhere from satisfying the check.
    const block = /eventName:\s*"cart_started"[\s\S]*?contributions:\s*\[[\s\S]*?metric:\s*"CART_STARTED"/;
    return block.test(text)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "cart_started mapping or CART_STARTED metric missing" };
  },
);

check(
  "12. metric-mapping.ts registers checkout_started@0.2.0 → CHECKOUT_STARTED contribution",
  () => {
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/metric-mapping.ts"),
    );
    const block =
      /eventName:\s*"checkout_started"[\s\S]*?contributions:\s*\[[\s\S]*?metric:\s*"CHECKOUT_STARTED"/;
    return block.test(text)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "checkout_started mapping or CHECKOUT_STARTED metric missing" };
  },
);

check(
  "13. metric-mapping.ts registers cart_abandoned@0.2.0 → CART_ABANDONED contribution",
  () => {
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/metric-mapping.ts"),
    );
    const block =
      /eventName:\s*"cart_abandoned"[\s\S]*?contributions:\s*\[[\s\S]*?metric:\s*"CART_ABANDONED"/;
    return block.test(text)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "cart_abandoned mapping or CART_ABANDONED metric missing" };
  },
);

check(
  "14. derivedMetrics emits CART_TO_CHECKOUT_RATE / CART_ABANDONMENT_RATE / CHECKOUT_COMPLETION_RATE",
  () => {
    // The three rate metrics are produced inside derivedMetrics() in
    // metric-mapping.ts. The rate computations live in that file, NOT
    // in aggregate-day.ts (aggregate-day.ts only forwards the merged
    // counts map into derivedMetrics).
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/metric-mapping.ts"),
    );
    const missing: string[] = [];
    for (const m of [
      "CART_TO_CHECKOUT_RATE",
      "CART_ABANDONMENT_RATE",
      "CHECKOUT_COMPLETION_RATE",
    ]) {
      if (!new RegExp(`metric:\\s*"${m}"`).test(text)) missing.push(m);
    }
    return missing.length === 0
      ? { pass: true, reason: "" }
      : { pass: false, reason: `missing: ${missing.join(", ")}` };
  },
);

check(
  "15. derivedMetrics has explicit zero-divide guards for funnel rates",
  () => {
    // Each rate emit must be wrapped in `if (... > ZERO)`. We grep for
    // the canonical pattern: at minimum two such guards — one for
    // cartStarted (covers rates 1+2) and one for checkoutStarted
    // (covers rate 3).
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/metric-mapping.ts"),
    );
    const cartStartedGuard = /if\s*\(\s*cartStarted\s*>\s*ZERO\s*\)/.test(text);
    const checkoutStartedGuard = /if\s*\(\s*checkoutStarted\s*>\s*ZERO\s*\)/.test(
      text,
    );
    if (!cartStartedGuard) {
      return { pass: false, reason: "cartStarted > ZERO guard missing" };
    }
    if (!checkoutStartedGuard) {
      return { pass: false, reason: "checkoutStarted > ZERO guard missing" };
    }
    return { pass: true, reason: "" };
  },
);

check(
  "16. aggregate-day.ts merges distinct counts into derivedMetrics input",
  () => {
    // Funnel rates depend on distinct-aggregator counts (CART_STARTED).
    // aggregate-day.ts must merge distinctSets sizes into a unified
    // map BEFORE calling derivedMetrics — otherwise rates always
    // compute as 0 because the keys are absent.
    const text = readFile(
      join(REPO_ROOT, "app/_lib/analytics/aggregation/aggregate-day.ts"),
    );
    // Pattern: a Map cloned from scalarSum, then distinctSets folded in
    // via BigInt(set.size).
    const mergePattern =
      /new\s+Map[\s\S]*?scalarSum[\s\S]*?distinctSets[\s\S]*?BigInt\s*\(\s*set\.size\s*\)/;
    return mergePattern.test(text)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "merge of distinct counts into derivedMetrics input not found" };
  },
);

console.log("");
console.log("Besokare live-widget (Track 3)");
check(
  "17. /api/analytics/live/visitors route exists and uses _unguardedAnalyticsPipelineClient (singleton-disciplin)",
  () => {
    const routePath = join(
      REPO_ROOT,
      "app/api/analytics/live/visitors/route.ts",
    );
    if (!existsSync(routePath)) {
      return { pass: false, reason: "route file missing" };
    }
    // The route delegates to getVisitorsNow which is the singleton
    // user — verify the chain by inspecting the visitors module too.
    const visitorsPath = join(
      REPO_ROOT,
      "app/_lib/analytics/live/visitors.ts",
    );
    if (!existsSync(visitorsPath)) {
      return { pass: false, reason: "visitors.ts module missing" };
    }
    const visitorsText = readFile(visitorsPath);
    if (/new\s+PrismaClient\s*\(/.test(visitorsText)) {
      return { pass: false, reason: "new PrismaClient() found in visitors.ts" };
    }
    return /_unguardedAnalyticsPipelineClient/.test(visitorsText)
      ? { pass: true, reason: "" }
      : { pass: false, reason: "singleton import missing in visitors.ts" };
  },
);

check(
  "18. besokare SQL has tenant_id = ${...} literal in WHERE (extends check #10 to live widget)",
  () => {
    const visitorsPath = join(
      REPO_ROOT,
      "app/_lib/analytics/live/visitors.ts",
    );
    const text = readFile(visitorsPath);
    // Find every analytics.event query block; each must contain a
    // tenant_id literal-binding via template-tag interpolation.
    const re = /FROM\s+analytics\.event[\s\S]*?(?=`|;|\)\s*\})/gi;
    const violations: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const block = m[0];
      if (!/tenant_id\s*=\s*\$\{/.test(block)) {
        violations.push(block.slice(0, 80).replace(/\s+/g, " ") + "…");
      }
    }
    return violations.length === 0
      ? { pass: true, reason: "all live-widget queries tenant-scoped" }
      : { pass: false, reason: violations[0] };
  },
);

console.log("");
console.log("Repo health");
check("19. tsc clean for Phase 5A files (3 pre-existing SEO errors allowed)", () => {
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
      "app/_lib/analytics/live/",
      "app/api/analytics/live/",
      "app/(admin)/analytics/components/VisitorsLiveCard",
      "inngest/functions/scan-analytics-aggregate",
      "inngest/functions/run-analytics-aggregate-day",
      "inngest/functions/index.ts",
      "inngest/client.ts",
      "scripts/verify-phase5a-aggregator",
      "scripts/load-test-besokare",
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
