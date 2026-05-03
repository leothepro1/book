/**
 * payment_succeeded v0.2.0 — verification.
 *
 *   $ npx tsx scripts/verify-payment-succeeded-v0.2.0.ts
 *
 * Static + test-runner checks confirming the v0.2.0 bump landed end-to-end:
 * legacy v0.1.0 schema preserved, new schema correct shape, registry
 * routes both versions, emit-site uses v0.2.0 payload, tests cover both.
 *
 * Phase 5A's aggregator depends on `source_channel` and `line_items[]`
 * being present in every emitted `payment_succeeded` event; this verifier
 * is the gate that the prerequisite is in place.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const SCHEMAS_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline/schemas");
const LEGACY_DIR = join(SCHEMAS_DIR, "legacy");

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

function containsAll(text: string, needles: string[]): { ok: boolean; missing: string[] } {
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing };
}

console.log("");
console.log("payment_succeeded v0.2.0 — verification");
console.log("───────────────────────────────────────");
console.log("");

console.log("S1 — schema files");
check("1. schemas/payment-succeeded.ts has schema_version literal '0.2.0'", () => {
  const text = readFile(join(SCHEMAS_DIR, "payment-succeeded.ts"));
  return /schema_version:\s*z\.literal\("0\.2\.0"\)/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected `schema_version: z.literal(\"0.2.0\")`" };
});
check("2. schemas/legacy/payment-succeeded-v0.1.0.ts exists with V010 exports", () => {
  const path = join(LEGACY_DIR, "payment-succeeded-v0.1.0.ts");
  if (!existsSync(path)) return { pass: false, reason: "legacy file missing" };
  const text = readFile(path);
  const phrases = [
    "PaymentSucceededV010Schema",
    "PaymentSucceededV010PayloadSchema",
    'z.literal("0.1.0")',
    'z.literal("payment_succeeded")',
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("3. v0.2.0 schema requires source_channel + line_items", () => {
  const text = readFile(join(SCHEMAS_DIR, "payment-succeeded.ts"));
  const phrases = [
    "source_channel: z.enum",
    '"direct"',
    '"admin_draft"',
    '"pms_import"',
    '"third_party_ota"',
    '"unknown"',
    "line_items: z.array",
    "PaymentSucceededLineItemSchema",
    "product_id: z.string().min(1)",
    "amount: z.number().int().nonnegative()",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("4. legacy v0.1.0 schema definition has no source_channel / line_items field declarations", () => {
  const text = readFile(join(LEGACY_DIR, "payment-succeeded-v0.1.0.ts"));
  // Limit the inspection to the actual Zod schema body — the doc-block
  // legitimately mentions the new v0.2.0 fields when describing the
  // deprecation rationale. Field declarations inside `z.object({ … })`
  // use the form `<name>: z.…`, so a regex on `source_channel:` /
  // `line_items:` finds the schema-side leak without false-positives.
  if (/\bsource_channel\s*:/.test(text)) {
    return {
      pass: false,
      reason: "legacy schema declares `source_channel:` — should be byte-equivalent to production v0.1.0",
    };
  }
  if (/\bline_items\s*:/.test(text)) {
    return {
      pass: false,
      reason: "legacy schema declares `line_items:` — should be byte-equivalent to production v0.1.0",
    };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S2 — registry");
check("5. registry imports PaymentSucceededV010Schema from legacy/", () => {
  const text = readFile(join(SCHEMAS_DIR, "registry.ts"));
  return /import\s*\{\s*PaymentSucceededV010Schema\s*\}\s*from\s*"\.\/legacy\/payment-succeeded-v0\.1\.0"/.test(
    text,
  )
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected import of PaymentSucceededV010Schema from legacy/" };
});
check("6. registry has BOTH 0.1.0 and 0.2.0 entries for payment_succeeded", () => {
  const text = readFile(join(SCHEMAS_DIR, "registry.ts"));
  const block = text.match(/payment_succeeded:\s*\{[^}]*\}/);
  if (!block) return { pass: false, reason: "no payment_succeeded block in registry" };
  if (!/"0\.1\.0":\s*PaymentSucceededV010Schema/.test(block[0])) {
    return { pass: false, reason: '"0.1.0" must point to PaymentSucceededV010Schema' };
  }
  if (!/"0\.2\.0":\s*PaymentSucceededSchema/.test(block[0])) {
    return { pass: false, reason: '"0.2.0" must point to PaymentSucceededSchema' };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S3 — emit-site");
check("7. process-paid-side-effects.ts emits schema_version 0.2.0", () => {
  const path = join(REPO_ROOT, "app/_lib/orders/process-paid-side-effects.ts");
  const text = readFile(path);
  // Must have BOTH the eventName + schemaVersion in the same emit block.
  const block = text.match(
    /eventName:\s*"payment_succeeded",[\s\S]{0,500}?schemaVersion:\s*"0\.2\.0"/,
  );
  return block
    ? { pass: true, reason: "" }
    : { pass: false, reason: 'expected `eventName: "payment_succeeded"` paired with `schemaVersion: "0.2.0"`' };
});
check("8. emit-site populates source_channel via deriveOrderSourceChannel", () => {
  const text = readFile(join(REPO_ROOT, "app/_lib/orders/process-paid-side-effects.ts"));
  return /source_channel:\s*deriveOrderSourceChannel\(order\)/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected `source_channel: deriveOrderSourceChannel(order)` in payload" };
});
check("9. emit-site populates line_items from order.lineItems", () => {
  const text = readFile(join(REPO_ROOT, "app/_lib/orders/process-paid-side-effects.ts"));
  // line_items is built from order.lineItems via .map — verify both the
  // assignment and the productId/totalAmount mapping.
  if (!/line_items:/.test(text)) {
    return { pass: false, reason: "no `line_items:` field in payload" };
  }
  if (!/order\.lineItems\.map/.test(text)) {
    return { pass: false, reason: "expected `order.lineItems.map(...)` in line_items construction" };
  }
  if (!/product_id:\s*li\.productId/.test(text)) {
    return { pass: false, reason: "expected `product_id: li.productId` mapping" };
  }
  if (!/amount:\s*li\.totalAmount/.test(text)) {
    return { pass: false, reason: "expected `amount: li.totalAmount` mapping" };
  }
  return { pass: true, reason: "" };
});
check("10. Order.lineItems is in the Prisma include at the emit-site", () => {
  // The existing fetch in processOrderPaidSideEffects already loads
  // lineItems for spot-marker cleanup; v0.2.0 reuses the same load.
  // This check confirms the include hasn't been removed.
  const text = readFile(join(REPO_ROOT, "app/_lib/orders/process-paid-side-effects.ts"));
  return /include:\s*\{[\s\S]{0,200}?lineItems:\s*true/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "Order fetch must `include: { lineItems: true }`" };
});

console.log("");
console.log("S4 — derivation helper");
check("11. integrations.ts exports deriveOrderSourceChannel + OrderSourceChannel", () => {
  const text = readFile(
    join(REPO_ROOT, "app/_lib/analytics/pipeline/integrations.ts"),
  );
  const phrases = [
    "export function deriveOrderSourceChannel",
    "export type OrderSourceChannel",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("12. deriveOrderSourceChannel handles all known Order.sourceChannel values", () => {
  const text = readFile(
    join(REPO_ROOT, "app/_lib/analytics/pipeline/integrations.ts"),
  );
  // Confirms the switch covers every value the operational code emits
  // (per grep: "direct", "admin_draft" — plus reserved "booking_com" /
  // "expedia") and falls through to "unknown" defensively.
  const fn =
    text.split("export function deriveOrderSourceChannel")[1]?.split("\nexport ")[0] ??
    "";
  const cases = ['case "direct":', 'case "admin_draft":', 'case "booking_com":', 'case "expedia":', "default:"];
  const { ok, missing } = containsAll(fn, cases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing switch arms: ${missing.join(", ")}` };
});

console.log("");
console.log("S5 — tests");
check("13. payment-succeeded.test.ts exists", () => {
  return existsSync(join(SCHEMAS_DIR, "payment-succeeded.test.ts"))
    ? { pass: true, reason: "" }
    : { pass: false, reason: "schemas/payment-succeeded.test.ts missing" };
});
check("14. integrations.test.ts has deriveOrderSourceChannel describe-block", () => {
  const text = readFile(
    join(REPO_ROOT, "app/_lib/analytics/pipeline/integrations.test.ts"),
  );
  return /describe\(\s*"deriveOrderSourceChannel/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "no `describe(\"deriveOrderSourceChannel\", …)` block" };
});
check("15. payment-succeeded test suite passes (vitest)", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/schemas/payment-succeeded.test.ts",
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
check("16. integrations test suite passes (vitest)", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/integrations.test.ts",
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
check("17. registry test suite passes (vitest) — both versions queryable", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/schemas/registry.test.ts",
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
console.log("S6 — docs");
check("18. event-catalog.md marks payment_succeeded as v0.2.0 Current", () => {
  const text = readFile(join(REPO_ROOT, "docs/analytics/event-catalog.md"));
  return /###\s*`payment_succeeded`\s*v0\.2\.0\s*—\s*Current/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "header must read `### \\`payment_succeeded\\` v0.2.0 — Current; v0.1.0 deprecated`" };
});
check("19. event-catalog.md has Schema versions table for payment_succeeded", () => {
  const text = readFile(join(REPO_ROOT, "docs/analytics/event-catalog.md"));
  // Anchor on the heading then look forward for the table marker.
  const block = text.split(/###\s*`payment_succeeded`/)[1]?.split(/\n###\s+/)[0] ?? "";
  if (!/Schema versions:/.test(block)) {
    return { pass: false, reason: "no `Schema versions:` table heading under payment_succeeded" };
  }
  if (!/v0\.2\.0\s*\|\s*Current/.test(block)) {
    return { pass: false, reason: "table must list v0.2.0 as Current" };
  }
  if (!/v0\.1\.0\s*\|\s*\*\*Deprecated\*\*/.test(block)) {
    return { pass: false, reason: "table must list v0.1.0 as Deprecated" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S7 — repo health");
check("20. tsc clean for files touched in this PR (scoped)", () => {
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/pipeline/schemas/payment-succeeded",
      "app/_lib/analytics/pipeline/schemas/legacy/payment-succeeded-v0.1.0",
      "app/_lib/analytics/pipeline/schemas/registry",
      "app/_lib/analytics/pipeline/integrations",
      "app/_lib/orders/process-paid-side-effects",
      "scripts/verify-payment-succeeded-v0.2.0",
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
console.log("───────────────────────────────────────");
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
