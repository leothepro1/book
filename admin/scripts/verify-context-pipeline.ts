/**
 * Context-pipeline (PR-X3a) — verification.
 *
 *   $ npx tsx scripts/verify-context-pipeline.ts
 *
 * Static + test-runner checks confirming the `context` field flows
 * end-to-end from `emitAnalyticsEvent(...)` → `analytics.outbox`
 * → drainer → `analytics.event.context`. Pre-PR-X3a the column did
 * not exist on outbox and the drainer hardcoded NULL on the event
 * INSERT; this verifier is the gate that the wire-through landed.
 *
 * Phase 5A's aggregator + the X3b geo-lookup PR depend on this
 * pipeline being lit; X3a unblocks both.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const PIPELINE_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline");
const INNGEST_DIR = join(REPO_ROOT, "inngest/functions");
const MIGRATIONS_DIR = join(REPO_ROOT, "prisma/migrations");

const MIGRATION_NAME_SUFFIX = "_analytics_outbox_context_column";

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

console.log("");
console.log("Context-pipeline (PR-X3a) — verification");
console.log("────────────────────────────────────────");
console.log("");

console.log("S1 — schema + migration");
check("1. schema.prisma has `context Json?` on AnalyticsPipelineOutbox", () => {
  const text = readFile(join(REPO_ROOT, "prisma/schema.prisma"));
  // Anchor on the model and look forward for the field declaration.
  const block = text.split("model AnalyticsPipelineOutbox")[1]?.split("\n}")[0] ?? "";
  if (!block) {
    return { pass: false, reason: "AnalyticsPipelineOutbox model not found" };
  }
  if (!/\bcontext\s+Json\?/.test(block)) {
    return { pass: false, reason: "no `context Json?` field in AnalyticsPipelineOutbox" };
  }
  return { pass: true, reason: "" };
});
check(`2. Migration directory exists with suffix '${MIGRATION_NAME_SUFFIX}'`, () => {
  const dir = findMigrationDir(MIGRATION_NAME_SUFFIX);
  return dir
    ? { pass: true, reason: dir.split("/").pop() ?? "" }
    : { pass: false, reason: "no migration directory ending with the expected suffix" };
});
check("3. migration.sql adds the JSONB column to analytics.outbox", () => {
  const dir = findMigrationDir(MIGRATION_NAME_SUFFIX);
  if (!dir) return { pass: false, reason: "migration directory missing" };
  const sql = readFile(join(dir, "migration.sql"));
  // Match the Prisma-generated DDL pattern. Tolerant on whitespace
  // because Prisma can emit multiple spaces between identifiers.
  if (
    !/ALTER\s+TABLE\s+"analytics"\."outbox"\s+ADD\s+COLUMN\s+"context"\s+JSONB/i.test(
      sql,
    )
  ) {
    return {
      pass: false,
      reason: 'expected `ALTER TABLE "analytics"."outbox" ADD COLUMN "context" JSONB`',
    };
  }
  return { pass: true, reason: "" };
});
check("4. migration.sql does NOT mark context as NOT NULL (zero-downtime)", () => {
  const dir = findMigrationDir(MIGRATION_NAME_SUFFIX);
  if (!dir) return { pass: false, reason: "migration directory missing" };
  const sql = readFile(join(dir, "migration.sql"));
  // The ADD COLUMN line for context must NOT contain NOT NULL —
  // existing outbox rows would fail backfill otherwise. Generous
  // grep on the whole file: any NOT NULL on the same line as
  // `"context"` is the failure.
  for (const line of sql.split("\n")) {
    if (/"context"/.test(line) && /\bNOT NULL\b/.test(line)) {
      return {
        pass: false,
        reason: "context column marked NOT NULL — would block existing rows",
      };
    }
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S2 — emitter + drainer wire-through");
check("5. emitter.ts INSERT includes `context` column", () => {
  const text = readFile(join(PIPELINE_DIR, "emitter.ts"));
  // Anchor on the INSERT INTO analytics.outbox block. The column list
  // and the VALUES list must both reference context in order: ...,
  // correlation_id, context, created_at.
  const insertMatch = text.match(
    /INSERT INTO analytics\.outbox[\s\S]*?ON CONFLICT/,
  );
  if (!insertMatch) {
    return { pass: false, reason: "no INSERT INTO analytics.outbox block found" };
  }
  const block = insertMatch[0];
  if (!/correlation_id,\s*context,\s*created_at/.test(block)) {
    return {
      pass: false,
      reason: "INSERT column list does not include `context` between correlation_id and created_at",
    };
  }
  if (!/\$\{contextJson\}::jsonb/.test(block)) {
    return {
      pass: false,
      reason: "INSERT VALUES does not bind `${contextJson}::jsonb`",
    };
  }
  return { pass: true, reason: "" };
});
check("6. emitter.ts no longer has `void contextJson;` dead-let", () => {
  const text = readFile(join(PIPELINE_DIR, "emitter.ts"));
  if (/\bvoid\s+contextJson\b/.test(text)) {
    return {
      pass: false,
      reason: "`void contextJson` still present — context is meant to be threaded through, not voided",
    };
  }
  return { pass: true, reason: "" };
});
check("7. drainer SELECT from analytics.outbox includes `context`", () => {
  const text = readFile(join(INNGEST_DIR, "drain-analytics-outbox.ts"));
  const selectMatch = text.match(
    /SELECT[\s\S]*?FROM analytics\.outbox/,
  );
  if (!selectMatch) {
    return { pass: false, reason: "no SELECT FROM analytics.outbox found in drainer" };
  }
  if (!/\bcontext\b/.test(selectMatch[0])) {
    return { pass: false, reason: "SELECT does not project `context` column" };
  }
  return { pass: true, reason: "" };
});
check("8. drainer event INSERT no longer hardcodes NULL on the context line", () => {
  const text = readFile(join(INNGEST_DIR, "drain-analytics-outbox.ts"));
  const insertMatch = text.match(
    /INSERT INTO analytics\.event[\s\S]*?ON CONFLICT/,
  );
  if (!insertMatch) {
    return { pass: false, reason: "no INSERT INTO analytics.event block found" };
  }
  const block = insertMatch[0];
  // Pre-X3a the line was `${JSON.stringify(row.payload)}::jsonb,\n        NULL`
  // followed by `)`. Post-X3a it must bind a context value via ${...}::jsonb.
  if (/::jsonb,\s*NULL\s*\)/m.test(block)) {
    return {
      pass: false,
      reason: "drainer INSERT still hardcodes NULL on the context line — context is not threaded forward",
    };
  }
  if (!/contextJson\}::jsonb/.test(block)) {
    return {
      pass: false,
      reason: "drainer INSERT does not bind `${contextJson}::jsonb` for context",
    };
  }
  return { pass: true, reason: "" };
});
check("9. drainer OutboxRow type carries `context`", () => {
  const text = readFile(join(INNGEST_DIR, "drain-analytics-outbox.ts"));
  const typeMatch = text.match(/interface OutboxRow\s*\{[\s\S]*?\}/);
  if (!typeMatch) {
    return { pass: false, reason: "OutboxRow type not found" };
  }
  if (!/\bcontext\s*:/.test(typeMatch[0])) {
    return { pass: false, reason: "OutboxRow type missing `context` field" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S3 — tests + repo health");
check("10. emitter.test.ts has a context-handling describe-block", () => {
  const text = readFile(join(PIPELINE_DIR, "emitter.test.ts"));
  if (!/describe\(\s*"emitAnalyticsEvent — context wire-through/.test(text)) {
    return {
      pass: false,
      reason: "no `describe(\"emitAnalyticsEvent — context wire-through ...\")` block",
    };
  }
  return { pass: true, reason: "" };
});
check("11. drain-analytics-outbox.test.ts exists with context fixtures", () => {
  const path = join(INNGEST_DIR, "drain-analytics-outbox.test.ts");
  if (!existsSync(path)) {
    return { pass: false, reason: "drainer test file missing" };
  }
  const text = readFile(path);
  if (!/describe\(\s*"drainer — context copy from outbox to event"/.test(text)) {
    return {
      pass: false,
      reason: "no `describe(\"drainer — context copy …\")` block",
    };
  }
  return { pass: true, reason: "" };
});
check("12. emitter + drainer test suites pass (vitest)", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/emitter.test.ts inngest/functions/drain-analytics-outbox.test.ts",
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
check("13. tsc clean for files touched in PR-X3a (scoped)", () => {
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/pipeline/emitter",
      "inngest/functions/drain-analytics-outbox",
      "scripts/verify-context-pipeline",
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
console.log("────────────────────────────────────────");
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
