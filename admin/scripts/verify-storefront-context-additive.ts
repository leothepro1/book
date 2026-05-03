/**
 * StorefrontContext additive (PR-X2) — verification.
 *
 *   $ npx tsx scripts/verify-storefront-context-additive.ts
 *
 * Static + test-runner checks confirming the optional additions to
 * `_storefront-context.ts` and the supporting loader-side machinery
 * landed end-to-end:
 *
 *   - Schema (Zod + hand-rolled mirror) carries device_type +
 *     visitor_id as OPTIONAL fields. NO version bump.
 *   - parseDeviceType / parseDeviceTypeFromNav helpers exist and
 *     classify per the documented buckets.
 *   - loader-context exports getOrCreateVisitorId / clearVisitorId
 *     using the canonical localStorage key `bf_visitor_id`.
 *   - buildStorefrontContext wires both fields into the returned
 *     context (best-effort — never throws).
 *   - Worker bundle stays under 30 KB gzipped.
 *   - No third-party UA-parsing libraries leaked into the runtime
 *     bundle.
 *
 * Phase 5A's aggregator depends on these dimensions arriving with
 * post-X2 emits; this verifier is the gate that the prerequisite is
 * in place.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const REPO_ROOT = resolve(__dirname, "..");
const SCHEMAS_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline/schemas");
const RUNTIME_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline/runtime");
const PUBLIC_DIR = join(REPO_ROOT, "public/analytics");

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
console.log("StorefrontContext additive (PR-X2) — verification");
console.log("─────────────────────────────────────────────────");
console.log("");

console.log("S1 — schema additive (Zod + hand-rolled mirror)");
check("1. _storefront-context.ts adds device_type + visitor_id as OPTIONAL", () => {
  const text = readFile(join(SCHEMAS_DIR, "_storefront-context.ts"));
  const phrases = [
    'device_type: z.enum(["desktop", "mobile", "tablet", "unknown"]).optional()',
    "visitor_id: z.string().min(1).optional()",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("2. _storefront-context.validator.ts mirrors both optional fields", () => {
  const text = readFile(join(SCHEMAS_DIR, "_storefront-context.validator.ts"));
  // Hand-rolled validator must skip-on-undefined for both fields and
  // validate enum / non-empty when present.
  if (!/payload\.device_type\s*!==\s*undefined/.test(text)) {
    return { pass: false, reason: "missing optional skip-undefined for device_type" };
  }
  if (!/payload\.visitor_id\s*!==\s*undefined/.test(text)) {
    return { pass: false, reason: "missing optional skip-undefined for visitor_id" };
  }
  if (!/DEVICE_TYPES\s*=\s*\[/.test(text)) {
    return { pass: false, reason: "missing DEVICE_TYPES enum-list constant" };
  }
  return { pass: true, reason: "" };
});
check("3. NO version bump on the StorefrontContext fragment (still v0.1.0 era)", () => {
  // The fragment file itself has no schema_version literal — the
  // bumps live on per-event schemas. Per-event STOREFRONT_SCHEMA_VERSIONS
  // in worker-validate.ts must remain 0.1.0 for all 7 storefront events.
  const text = readFile(join(RUNTIME_DIR, "worker-validate.ts"));
  const eventNames = [
    "page_viewed",
    "accommodation_viewed",
    "availability_searched",
    "cart_started",
    "cart_updated",
    "cart_abandoned",
    "checkout_started",
  ];
  for (const name of eventNames) {
    const re = new RegExp(`${name}:\\s*"0\\.1\\.0"`);
    if (!re.test(text)) {
      return { pass: false, reason: `${name} not at "0.1.0" — additive PR-X2 must NOT bump cascading versions` };
    }
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S2 — parseDeviceType helper (loader-side)");
check("4. runtime/device-type.ts exists and exports both functions", () => {
  const path = join(RUNTIME_DIR, "device-type.ts");
  if (!existsSync(path)) return { pass: false, reason: "device-type.ts missing" };
  const text = readFile(path);
  const phrases = [
    "export function parseDeviceType",
    "export function parseDeviceTypeFromNav",
    "export type DeviceType",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("5. iPadOS 13+ MacIntel + multi-touch fix is implemented", () => {
  const text = readFile(join(RUNTIME_DIR, "device-type.ts"));
  // Two markers must be present together: MacIntel-platform regex AND
  // a maxTouchPoints > 1 comparison.
  if (!/MacIntel/.test(text)) {
    return { pass: false, reason: "no MacIntel platform check (iPadOS 13+ fix missing)" };
  }
  if (!/maxTouchPoints\s*>\s*1/.test(text)) {
    return { pass: false, reason: "no `maxTouchPoints > 1` discriminator" };
  }
  return { pass: true, reason: "" };
});
check("6. device-type.test.ts exists with at least 10 fixtures (UA-only + Nav-aware)", () => {
  const path = join(RUNTIME_DIR, "device-type.test.ts");
  if (!existsSync(path)) return { pass: false, reason: "device-type.test.ts missing" };
  const text = readFile(path);
  // Count `it(` invocations as a fixture-count proxy. Including
  // it.each, but the iterations parameter expands at runtime;
  // 10 unique it() blocks is the floor.
  const itMatches = text.match(/\bit\(/g) ?? [];
  if (itMatches.length < 10) {
    return { pass: false, reason: `only ${itMatches.length} it() blocks; spec requires ≥10` };
  }
  return { pass: true, reason: `${itMatches.length} fixtures` };
});

console.log("");
console.log("S3 — visitor_id in loader-context.ts");
check("7. loader-context.ts exports getOrCreateVisitorId + clearVisitorId", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  const phrases = [
    "export function getOrCreateVisitorId",
    "export function clearVisitorId",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("8. localStorage key is exactly 'bf_visitor_id'", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  // Must be the `VISITOR_KEY` constant string. Anchor on the
  // declaration to avoid matching doc-block uses.
  if (!/const\s+VISITOR_KEY\s*=\s*"bf_visitor_id"/.test(text)) {
    return { pass: false, reason: 'expected `const VISITOR_KEY = "bf_visitor_id"`' };
  }
  return { pass: true, reason: "" };
});
check("9. SSR-safe: getOrCreateVisitorId returns empty string when window is undefined", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  // Guard pattern.
  if (!/typeof\s+window\s*===\s*"undefined"/.test(text)) {
    return { pass: false, reason: "no SSR guard `typeof window === 'undefined'` in loader-context.ts" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S4 — buildStorefrontContext wiring");
check("10. buildStorefrontContext invokes parseDeviceTypeFromNav AND getOrCreateVisitorId", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  const fn =
    text.split("export function buildStorefrontContext")[1]?.split("\nexport ")[0] ??
    "";
  const phrases = ["parseDeviceTypeFromNav(", "getOrCreateVisitorId()"];
  const { ok, missing } = containsAll(fn, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing in buildStorefrontContext body: ${missing.join(", ")}` };
});
check("11. buildStorefrontContext uses try/catch for both fields (best-effort, never throws)", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  const fn =
    text.split("export function buildStorefrontContext")[1]?.split("\nexport ")[0] ??
    "";
  // At least 2 try-catch blocks within the function body — one per
  // optional field.
  const tryMatches = fn.match(/\btry\s*\{/g) ?? [];
  if (tryMatches.length < 2) {
    return {
      pass: false,
      reason: `only ${tryMatches.length} try-blocks; expected ≥2 (one per optional field)`,
    };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S5 — validator-parity fixtures");
check("12. validator-parity.test.ts has fixtures for both device_type + visitor_id", () => {
  const text = readFile(join(SCHEMAS_DIR, "validator-parity.test.ts"));
  const phrases = [
    "device_type: \"desktop\"",
    "device_type: \"mobile\"",
    "device_type: \"tablet\"",
    "device_type: \"unknown\"",
    'device_type: "iphone"', // invalid enum fixture
    "visitor_id:",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing fixtures: ${missing.join(", ")}` };
});

console.log("");
console.log("S6 — bundle size + hygiene");
check("13. runtime + loader bundles built and present", () => {
  if (!existsSync(PUBLIC_DIR)) {
    return { pass: false, reason: "public/analytics dir missing — run `npm run build:analytics-runtime`" };
  }
  const files = readdirSync(PUBLIC_DIR);
  const hasRuntime = files.some((f) => /^runtime\.[0-9a-f]+\.js$/.test(f));
  const hasLoader = files.some((f) => /^loader\.[0-9a-f]+\.js$/.test(f));
  if (!hasRuntime || !hasLoader) {
    return {
      pass: false,
      reason: `missing bundle: runtime=${hasRuntime ? "ok" : "missing"} loader=${hasLoader ? "ok" : "missing"}`,
    };
  }
  return { pass: true, reason: "" };
});
check("14. runtime bundle gzipped < 30 KB (locked budget)", () => {
  const files = readdirSync(PUBLIC_DIR).filter((f) =>
    /^runtime\.[0-9a-f]+\.js$/.test(f),
  );
  if (files.length === 0) {
    return { pass: false, reason: "no runtime.<hash>.js found" };
  }
  // Sort by mtime — newest wins (avoid stale artifacts).
  const newest = files
    .map((f) => ({ f, m: statSync(join(PUBLIC_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0]!.f;
  const code = readFileSync(join(PUBLIC_DIR, newest));
  const gz = gzipSync(code).length;
  if (gz > 30 * 1024) {
    return { pass: false, reason: `${gz} bytes gz exceeds 30 KB budget` };
  }
  return { pass: true, reason: `${gz} bytes gz / 30720 budget` };
});
check("15. Bundle contains no third-party UA-parser-js / bowser imports", () => {
  const files = readdirSync(PUBLIC_DIR).filter((f) =>
    /^(runtime|loader)\.[0-9a-f]+\.js$/.test(f),
  );
  for (const f of files) {
    const code = readFileSync(join(PUBLIC_DIR, f), "utf8");
    if (/ua-parser-js|\bbowser\b/i.test(code)) {
      return { pass: false, reason: `${f} contains a third-party UA library marker` };
    }
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S7 — repo health");
check("16. tsc clean for files touched in PR-X2 (scoped check)", () => {
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/pipeline/schemas/_storefront-context",
      "app/_lib/analytics/pipeline/runtime/device-type",
      "app/_lib/analytics/pipeline/runtime/loader-context",
      "scripts/verify-storefront-context-additive",
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
check("17. No `as any` casts in PR-X2-touched files", () => {
  const files = [
    join(SCHEMAS_DIR, "_storefront-context.ts"),
    join(SCHEMAS_DIR, "_storefront-context.validator.ts"),
    join(RUNTIME_DIR, "device-type.ts"),
    join(RUNTIME_DIR, "loader-context.ts"),
  ];
  for (const f of files) {
    const text = readFile(f);
    if (/\bas\s+any\b/.test(text)) {
      return { pass: false, reason: `${f} contains an \`as any\` cast` };
    }
  }
  return { pass: true, reason: "" };
});
check("18. No `console.*` in device-type.ts (loader-side, log() not available)", () => {
  // device-type is a pure helper — no logging at all is the right
  // posture. loader-context already uses log()-style hooks where
  // needed (Sentry breadcrumbs); we only police device-type here.
  const text = readFile(join(RUNTIME_DIR, "device-type.ts"));
  if (/\bconsole\.(log|warn|error|info|debug)\b/.test(text)) {
    return { pass: false, reason: "device-type.ts uses console.* — should be silent" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S8 — test suites");
check("19. device-type test suite passes", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/runtime/device-type.test.ts",
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
check("20. validator-parity test suite passes (Zod ↔ hand-rolled lockstep)", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/schemas/validator-parity.test.ts",
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
check("21. loader-context test suite passes (visitor_id + device_type wiring)", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/runtime/loader-context.test.ts",
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
const passed = results.filter((r) => r.result.pass).length;
const total = results.length;
console.log("─────────────────────────────────────────────────");
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
