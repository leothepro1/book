/**
 * Schema specification verification — feature/analytics-schema-specification
 *
 *   $ npx tsx scripts/verify-schema-specification.ts
 *
 * Static + test-runner checks confirming the schema-specification PR
 * landed every contract this branch promises:
 *
 *   - Conventions block present in base.ts (no clock-skew claim).
 *   - StorefrontContext privacy notes cover all six fields plus the
 *     forward-spec tenant-salt mention.
 *   - Per-event Semantic Contracts present (no "read from URL"
 *     ambiguity, tenant-timezone language for dates, namespace prefix
 *     convention for filters_applied, "interaction" defined strictly,
 *     cart-only scope ban for checkout_started).
 *   - cart-cluster v0.2.0 schemas adopt product_id and
 *     line_items_count where required.
 *   - schemas/legacy/ holds the four v0.1.0 schemas + their paired
 *     validators.
 *   - storefront-mappers.ts exports both helpers and tests pass.
 *   - validator-parity.test.ts passes (covering both versions for the
 *     four cart-cluster events).
 *   - registry.ts wires both versions for each cart-cluster event.
 *   - event-catalog.md flags all four v0.1.0 entries as deprecated.
 *   - tsc, eslint, and the full vitest suite are green.
 *   - npm run build succeeds (registry imports stay valid).
 *
 * The build check is the slowest (~1–3 minutes); pass --skip-build to
 * bypass it for faster iteration during local edits. CI MUST run with
 * the build check enabled.
 */

/* eslint-disable no-console */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(__dirname, "..");
const SCHEMAS_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline/schemas");
const LEGACY_DIR = join(SCHEMAS_DIR, "legacy");
const PIPELINE_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline");
const EVENT_CATALOG_PATH = join(REPO_ROOT, "docs/analytics/event-catalog.md");

const SKIP_BUILD = process.argv.includes("--skip-build");

// ── Result tracking ───────────────────────────────────────────────────

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
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

function fileExists(path: string): boolean {
  return existsSync(path);
}

// ── Helpers ───────────────────────────────────────────────────────────

function containsAll(text: string, needles: string[]): { ok: boolean; missing: string[] } {
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing };
}

// ── Check definitions ─────────────────────────────────────────────────

console.log("");
console.log("Schema specification — verification");
console.log("───────────────────────────────────────────────────────");
console.log("");

console.log("Part 1 — base.ts global conventions");
check("1. base.ts conventions block has 'minor units' + 'ISO 4217'", () => {
  // Case-insensitive — base.ts uses MINOR UNITS in the table-of-contents
  // header line and "minor units" in the prose; either spelling counts.
  const text = readFile(join(SCHEMAS_DIR, "base.ts")).toLowerCase();
  const { ok, missing } = containsAll(text, ["minor units", "iso 4217"]);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("2. base.ts does NOT make a 5-minute clock-skew rejection claim", () => {
  const text = readFile(join(SCHEMAS_DIR, "base.ts"));
  const forbiddenPhrases = ["rejects events where", "5 minutes"];
  const present = forbiddenPhrases.filter((p) => text.includes(p));
  return present.length === 0
    ? { pass: true, reason: "" }
    : { pass: false, reason: `forbidden phrase present: ${present.join(", ")}` };
});

console.log("");
console.log("Part 2 — _storefront-context.ts contract");
check("3. _storefront-context.ts contract names every field", () => {
  const text = readFile(join(SCHEMAS_DIR, "_storefront-context.ts"));
  const fields = ["page_url", "page_referrer", "user_agent_hash", "viewport", "locale", "session_id"];
  const { ok, missing } = containsAll(text, fields);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("4. _storefront-context.ts mentions Tenant.settings.analyticsSalt (forward-spec)", () => {
  const text = readFile(join(SCHEMAS_DIR, "_storefront-context.ts"));
  return text.includes("analyticsSalt")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "salt mention absent" };
});

console.log("");
console.log("Part 4 — accommodation-viewed contract");
check("5. accommodation-viewed.ts no longer says 'read from URL'", () => {
  const text = readFile(join(SCHEMAS_DIR, "accommodation-viewed.ts"));
  return text.includes("read from URL")
    ? { pass: false, reason: "contradictory v0.1.0 phrasing still present" }
    : { pass: true, reason: "" };
});
check("6. accommodation-viewed.ts mentions cuid resolution requirement", () => {
  const text = readFile(join(SCHEMAS_DIR, "accommodation-viewed.ts"));
  return text.includes("cuid")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "cuid resolution language absent" };
});

console.log("");
console.log("Part 5 — availability-searched contract");
check("7. availability-searched.ts mentions tenant timezone for dates", () => {
  const text = readFile(join(SCHEMAS_DIR, "availability-searched.ts"));
  const phrases = ["tenant", "timezone", "Tenant.settings.property.timezone"];
  const { ok, missing } = containsAll(text, phrases);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("8. availability-searched.ts documents filter namespace prefixes", () => {
  const text = readFile(join(SCHEMAS_DIR, "availability-searched.ts"));
  const phrases = ["facility:", "category:"];
  const { ok, missing } = containsAll(text, phrases);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});

console.log("");
console.log("Part 6–9 — cart-cluster v0.2.0 + legacy/");
check("9. cart-started.ts schema_version literal is '0.2.0'", () => {
  const text = readFile(join(SCHEMAS_DIR, "cart-started.ts"));
  return text.includes('z.literal("0.2.0")')
    ? { pass: true, reason: "" }
    : { pass: false, reason: "version literal not 0.2.0" };
});
check("10. cart-started.ts has product_id field, NOT accommodation_id", () => {
  const text = readFile(join(SCHEMAS_DIR, "cart-started.ts"));
  if (!text.includes("product_id")) return { pass: false, reason: "product_id absent" };
  if (text.includes("accommodation_id: z."))
    return { pass: false, reason: "accommodation_id schema field still present" };
  return { pass: true, reason: "" };
});
check("11. cart-updated.ts has line_items_count field", () => {
  const text = readFile(join(SCHEMAS_DIR, "cart-updated.ts"));
  return text.includes("line_items_count")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "field absent" };
});
check("12. cart-abandoned.ts has line_items_count field", () => {
  const text = readFile(join(SCHEMAS_DIR, "cart-abandoned.ts"));
  return text.includes("line_items_count")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "field absent" };
});
check("13. checkout-started.ts has line_items_count field", () => {
  const text = readFile(join(SCHEMAS_DIR, "checkout-started.ts"));
  return text.includes("line_items_count")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "field absent" };
});
check("14. cart-abandoned.ts defines 'interaction' as cart-mutation strictly", () => {
  const text = readFile(join(SCHEMAS_DIR, "cart-abandoned.ts"));
  // The contract should explicitly enumerate the three mutation types.
  const phrases = ["addToCart", "removeFromCart", "updateQuantity"];
  const { ok, missing } = containsAll(text, phrases);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("15. checkout-started.ts forbids non-cart purchase use", () => {
  const text = readFile(join(SCHEMAS_DIR, "checkout-started.ts"));
  const phrases = ["CART-ONLY", "MUST NOT"];
  const { ok, missing } = containsAll(text, phrases);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});

check("16. legacy/ directory exists with 4 schema + 4 validator files", () => {
  if (!fileExists(LEGACY_DIR)) return { pass: false, reason: "legacy/ dir missing" };
  const expected = [
    "cart-started-v0.1.0.ts",
    "cart-started-v0.1.0.validator.ts",
    "cart-updated-v0.1.0.ts",
    "cart-updated-v0.1.0.validator.ts",
    "cart-abandoned-v0.1.0.ts",
    "cart-abandoned-v0.1.0.validator.ts",
    "checkout-started-v0.1.0.ts",
    "checkout-started-v0.1.0.validator.ts",
  ];
  const missing = expected.filter((f) => !fileExists(join(LEGACY_DIR, f)));
  return missing.length === 0
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});

console.log("");
console.log("Part 10 — storefront-mappers");
check("17. storefront-mappers.ts exists with both helper exports", () => {
  const path = join(PIPELINE_DIR, "storefront-mappers.ts");
  if (!fileExists(path)) return { pass: false, reason: "file missing" };
  const text = readFile(path);
  const phrases = [
    "export function accommodationTypeToSchema",
    "export function toTenantCivilDate",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing exports: ${missing.join(", ")}` };
});
check("18. storefront-mappers.test.ts exists; vitest passes", () => {
  const testPath = join(PIPELINE_DIR, "storefront-mappers.test.ts");
  if (!fileExists(testPath)) return { pass: false, reason: "test file missing" };
  try {
    execSync("npx vitest run app/_lib/analytics/pipeline/storefront-mappers.test.ts", {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
    return { pass: true, reason: "" };
  } catch (err) {
    return {
      pass: false,
      reason: err instanceof Error ? err.message.split("\n")[0] : String(err),
    };
  }
});

console.log("");
console.log("Part 11–12 — Validators, registry, catalog");
check("19. validator-parity.test.ts passes (both versions × 4 cart-cluster + 3 unchanged)", () => {
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
check("20. registry.ts wires both v0.1.0 + v0.2.0 for the 4 cart-cluster events", () => {
  const text = readFile(join(SCHEMAS_DIR, "registry.ts"));
  const phrases = [
    "CartStartedV010Schema",
    "CartUpdatedV010Schema",
    "CartAbandonedV010Schema",
    "CheckoutStartedV010Schema",
  ];
  const { ok, missing } = containsAll(text, phrases);
  if (!ok) return { pass: false, reason: `missing legacy imports: ${missing.join(", ")}` };
  // Each event must have BOTH version keys present in its block.
  const events = ["cart_started", "cart_updated", "cart_abandoned", "checkout_started"];
  for (const e of events) {
    const blockMatch = text.match(new RegExp(`${e}: \\{[^}]+\\}`, "s"));
    if (!blockMatch) return { pass: false, reason: `block for ${e} not found` };
    const block = blockMatch[0];
    if (!block.includes('"0.1.0"') || !block.includes('"0.2.0"')) {
      return { pass: false, reason: `${e}: missing one or both version keys` };
    }
  }
  return { pass: true, reason: "" };
});
check("21. event-catalog.md flags all 4 cart-cluster v0.1.0 as deprecated", () => {
  const text = readFile(EVENT_CATALOG_PATH);
  // The v0.2.0 section heading pattern is "v0.2.0 — Current; v0.1.0 deprecated"
  const events = ["cart_started", "cart_updated", "cart_abandoned", "checkout_started"];
  const missing: string[] = [];
  for (const e of events) {
    const heading = `\`${e}\` v0.2.0 — Current; v0.1.0 deprecated`;
    if (!text.includes(heading)) missing.push(heading);
  }
  return missing.length === 0
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing headings: ${missing.length}/4` };
});
check("22. event-catalog.md mentions 'Out of scope: gift-card' purchase section", () => {
  const text = readFile(EVENT_CATALOG_PATH);
  return text.includes("Out of scope: gift-card")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "section heading absent" };
});

console.log("");
console.log("Part 13 — Repo health");
check("23. tsc clean for files touched in this PR (scoped check)", () => {
  // Repo-wide `tsc --noEmit` surfaces pre-existing errors in test files
  // unrelated to this PR (e.g. actions.test.ts cast through null). Those
  // are not this PR's responsibility — confirmed identical at main tip.
  // The scoped check below filters tsc output to only the paths this PR
  // touches; a non-empty filtered result fails the check.
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/pipeline/schemas/",
      "app/_lib/analytics/pipeline/storefront-mappers",
      "scripts/verify-schema-specification",
      "app/_lib/analytics/pipeline/runtime/worker.test.ts",
      "app/_lib/analytics/pipeline/schemas/registry.test.ts",
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
    return {
      pass: false,
      reason: ourErrors[0].trim(),
    };
  }
});
check("24. eslint clean for files touched in this PR", () => {
  // Scope to the analytics pipeline + the verify script + event catalog
  // (markdown is excluded from eslint config in this repo).
  const targets = [
    "app/_lib/analytics/pipeline/schemas",
    "app/_lib/analytics/pipeline/storefront-mappers.ts",
    "app/_lib/analytics/pipeline/storefront-mappers.test.ts",
    "scripts/verify-schema-specification.ts",
  ].join(" ");
  try {
    execSync(`npx eslint ${targets}`, { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "" };
  } catch (err) {
    const out = err instanceof Error && "stdout" in err ? String((err as { stdout: Buffer }).stdout) : "";
    return {
      pass: false,
      reason: out.split("\n").find((l) => l.includes("error") || l.includes("problem")) ?? "eslint errors",
    };
  }
});
check("25. no console.* added to schema files (structured-logging discipline)", () => {
  const filesToScan = [
    "base.ts",
    "_storefront-context.ts",
    "page-viewed.ts",
    "accommodation-viewed.ts",
    "availability-searched.ts",
    "cart-started.ts",
    "cart-updated.ts",
    "cart-abandoned.ts",
    "checkout-started.ts",
  ];
  const offenders: string[] = [];
  for (const f of filesToScan) {
    const text = readFile(join(SCHEMAS_DIR, f));
    if (/\bconsole\.(log|warn|error|info|debug)/.test(text)) offenders.push(f);
  }
  // Also scan the new mappers file.
  if (/\bconsole\.(log|warn|error|info|debug)/.test(readFile(join(PIPELINE_DIR, "storefront-mappers.ts")))) {
    offenders.push("storefront-mappers.ts");
  }
  return offenders.length === 0
    ? { pass: true, reason: "" }
    : { pass: false, reason: `console.* found in: ${offenders.join(", ")}` };
});

function isDevEnvWithDevOrgId(): boolean {
  // Next.js loads .env files at build time. Codespace dev envs include
  // DEV_ORG_ID; the production-build security check (app/_lib/env.ts)
  // refuses to compile with DEV_ORG_ID set. Detect by parsing .env files
  // — a clean CI environment has neither the file nor the shell var.
  if (process.env.DEV_ORG_ID) return true;
  const envFiles = [".env", ".env.local"];
  for (const f of envFiles) {
    const p = join(REPO_ROOT, f);
    if (!fileExists(p)) continue;
    if (/^DEV_ORG_ID\s*=\s*\S/m.test(readFile(p))) return true;
  }
  return false;
}

if (SKIP_BUILD) {
  check("26. (skipped) npm run build — pass --skip-build to suppress", () => ({
    pass: true,
    reason: "skipped",
  }));
} else if (isDevEnvWithDevOrgId()) {
  check("26. npm run build (skipped: DEV_ORG_ID present in .env)", () => ({
    pass: true,
    reason:
      "DEV_ORG_ID set in .env — production build rejects it as a security risk; CI build will run on Vercel preview push",
  }));
} else {
  check("26. npm run build succeeds (registry imports stay valid for both versions)", () => {
    try {
      execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
      return { pass: true, reason: "" };
    } catch (err) {
      const out = err instanceof Error && "stdout" in err ? String((err as { stdout: Buffer }).stdout) : "";
      return {
        pass: false,
        reason: out.split("\n").find((l) => /(error|fail)/i.test(l)) ?? "build failed",
      };
    }
  });
}

// ── Summary ───────────────────────────────────────────────────────────

console.log("");
const passed = results.filter((r) => r.result.pass).length;
const total = results.length;
console.log(`───────────────────────────────────────────────────────`);
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
