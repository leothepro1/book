/**
 * Loader hardening (Phase 1 — optional salt) verification.
 *
 *   $ npx tsx scripts/verify-loader-hardening.ts
 *
 * Static + test-runner checks confirming Phase A landed every
 * forward-spec contract that PR #27 documented as target loader
 * behavior, with the optional-salt fallback intact.
 *
 * NOT covered here (lands in Phase 2 / Phase 3):
 *   - Backfill migration + IS NULL guard + pgcrypto availability
 *   - Required-field tightening + post-backfill 0-nulls assertion
 *   - getAnalyticsSalt's throw on absence
 *
 * The build check (#14) detects DEV_ORG_ID in .env and skips
 * because production builds reject DEV_ORG_ID as a security risk.
 * CI / Vercel preview runs the full build; pass --skip-build for
 * fast local iteration.
 */

/* eslint-disable no-console */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = resolve(__dirname, "..");
const PIPELINE_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline");
const RUNTIME_DIR = join(PIPELINE_DIR, "runtime");

const SKIP_BUILD = process.argv.includes("--skip-build");

interface CheckResult { pass: boolean; reason: string }
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

function isDevEnvWithDevOrgId(): boolean {
  if (process.env.DEV_ORG_ID) return true;
  for (const f of [".env", ".env.local"]) {
    const p = join(REPO_ROOT, f);
    if (!existsSync(p)) continue;
    if (/^DEV_ORG_ID\s*=\s*\S/m.test(readFile(p))) return true;
  }
  return false;
}

console.log("");
console.log("Loader hardening (Phase 1 — optional salt) — verification");
console.log("───────────────────────────────────────────────────────");
console.log("");

console.log("A1 — AnalyticsSettings type + helper");
check("1. tenant-settings.ts exists with AnalyticsSettings type + helpers", () => {
  const path = join(PIPELINE_DIR, "tenant-settings.ts");
  if (!existsSync(path)) return { pass: false, reason: "file missing" };
  const text = readFile(path);
  const phrases = [
    "export type AnalyticsSettings",
    "export function getAnalyticsSalt",
    "export async function generateAnalyticsSalt",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok ? { pass: true, reason: "" } : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("2. AnalyticsSettings.analyticsSalt is OPTIONAL in Phase 1 (string | undefined)", () => {
  const text = readFile(join(PIPELINE_DIR, "tenant-settings.ts"));
  return text.includes("analyticsSalt: string | undefined")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected 'analyticsSalt: string | undefined' in type def" };
});
check("3. getAnalyticsSalt does NOT throw on absence in Phase 1 (returns undefined)", () => {
  const text = readFile(join(PIPELINE_DIR, "tenant-settings.ts"));
  // Phase 3 will add `throw new Error(...)` to the helper. Phase 1
  // must not — the function returns undefined and structured-logs.
  const inFunctionBody = text
    .split("export function getAnalyticsSalt")[1]
    ?.split("export ")[0] ?? "";
  if (inFunctionBody.includes("throw new")) {
    return { pass: false, reason: "throw present — should be Phase 3 only" };
  }
  if (!inFunctionBody.includes('log("warn"')) {
    return { pass: false, reason: "expected structured-log warn on absence" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("A2 — Tenant write-sites mint salt");
check("4. Clerk webhook mints salt on organization.created", () => {
  const text = readFile(join(REPO_ROOT, "app/api/webhooks/clerk/route.ts"));
  const { ok, missing } = containsAll(text, [
    "generateAnalyticsSalt",
    "analyticsSalt",
  ]);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("5. seed-test-tenant.ts mints salt on create branch", () => {
  const text = readFile(join(REPO_ROOT, "scripts/seed-test-tenant.ts"));
  return /generateAnalyticsSalt|analyticsSalt/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "no analyticsSalt reference" };
});
check("6. sync-clerk-org.ts mints salt on create branch", () => {
  const text = readFile(join(REPO_ROOT, "scripts/sync-clerk-org.ts"));
  return /generateAnalyticsSalt|analyticsSalt/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "no analyticsSalt reference" };
});

console.log("");
console.log("A3 — SSR injection");
check("7. AnalyticsLoader.tsx accepts tenantSalt prop", () => {
  const text = readFile(
    join(REPO_ROOT, "app/(guest)/_components/AnalyticsLoader.tsx"),
  );
  return text.includes("tenantSalt")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "tenantSalt prop missing" };
});
check("8. AnalyticsLoader injects window.__bedfront_analytics_salt", () => {
  const text = readFile(
    join(REPO_ROOT, "app/(guest)/_components/AnalyticsLoader.tsx"),
  );
  return text.includes("window.__bedfront_analytics_salt")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "window.__bedfront_analytics_salt assignment absent" };
});
check("9. SSR injection uses ?? '' to avoid JSON.stringify(undefined) literal", () => {
  const text = readFile(
    join(REPO_ROOT, "app/(guest)/_components/AnalyticsLoader.tsx"),
  );
  // Either inline `tenantSalt ?? ""` or normalized in inlineGlobals.
  return /tenantSalt\s*\?\?\s*""/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected tenantSalt ?? '' guard" };
});
check("10. Guest layout passes tenantSalt to AnalyticsLoader", () => {
  const text = readFile(join(REPO_ROOT, "app/(guest)/layout.tsx"));
  const phrases = ["getAnalyticsSalt", "tenantSalt"];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});

console.log("");
console.log("A4 — page_url sanitization");
check("11. sanitizePageUrl helper exists in loader-context.ts", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  return text.includes("export function sanitizePageUrl")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "sanitizePageUrl export missing" };
});
check("12. Allowlist contains the 7 expected query parameters", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  const expected = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
  ];
  const { ok, missing } = containsAll(text, expected);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing in allowlist: ${missing.join(", ")}` };
});
check("13. sanitizePageUrl is called from buildStorefrontContext for page_url", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  return /page_url:\s*sanitizePageUrl\(/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "page_url not wrapped in sanitizePageUrl" };
});
check("14. page_referrer is NOT sanitized (pass-through preserved)", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  // page_referrer must be `document.referrer`, not a sanitized version.
  return /page_referrer:\s*document\.referrer/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "page_referrer no longer raw document.referrer" };
});

console.log("");
console.log("A5 — user_agent_hash salt application");
check("15. precomputeUserAgentHash reads window.__bedfront_analytics_salt", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  return text.includes("__bedfront_analytics_salt")
    ? { pass: true, reason: "" }
    : { pass: false, reason: "salt read absent" };
});
check("16. Hash input includes salt + ':' + ua construction", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  return /\$\{salt\}:\$\{ua\}/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected `${salt}:${ua}` template literal" };
});
check("17. Loader bootstrap passes onMissingSalt callback to Sentry", () => {
  const text = readFile(join(RUNTIME_DIR, "loader.ts"));
  return /reportToSentry\("analytics\.salt\.missing"/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "salt-missing Sentry path absent" };
});

console.log("");
console.log("A6 — session_id rotation");
check("18. isSessionIdle / clearSessionId / markSessionEmit exported", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  const phrases = [
    "export function isSessionIdle",
    "export function clearSessionId",
    "export function markSessionEmit",
  ];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing: ${missing.join(", ")}` };
});
check("19. 30-minute idle threshold defined as constant", () => {
  const text = readFile(join(RUNTIME_DIR, "loader-context.ts"));
  return /30\s*\*\s*60\s*\*\s*1000/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "expected `30 * 60 * 1000` for SESSION_IDLE_MS" };
});
check("20. loader.ts track() calls isSessionIdle + maybeRotateOnConsentTransition", () => {
  const text = readFile(join(RUNTIME_DIR, "loader.ts"));
  const phrases = ["isSessionIdle", "maybeRotateOnConsentTransition"];
  const { ok, missing } = containsAll(text, phrases);
  return ok
    ? { pass: true, reason: "" }
    : { pass: false, reason: `missing in loader.ts: ${missing.join(", ")}` };
});
check("21. writeConsentCookie clears bf_sid when analytics:false (single-source path)", () => {
  const text = readFile(join(RUNTIME_DIR, "consent-banner.ts"));
  if (!text.includes("clearSessionStorageKeys")) {
    return { pass: false, reason: "clearSessionStorageKeys helper absent" };
  }
  if (!/choice\.analytics\s*===\s*false/.test(text)) {
    return { pass: false, reason: "deny-path branch absent" };
  }
  return { pass: true, reason: "" };
});
check("22. loader.ts maybeRotateOnConsentTransition handles deny→grant", () => {
  const text = readFile(join(RUNTIME_DIR, "loader.ts"));
  return /prior\s*===\s*"deny"\s*&&\s*current\s*===\s*"grant"/.test(text)
    ? { pass: true, reason: "" }
    : { pass: false, reason: "deny→grant comparison absent" };
});

console.log("");
console.log("Test suites");
check("23. tenant-settings unit tests pass", () => {
  try {
    execSync("npx vitest run app/_lib/analytics/pipeline/tenant-settings.test.ts", {
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
check("24. loader-context tests pass (sanitizer + salt + rotation)", () => {
  try {
    execSync("npx vitest run app/_lib/analytics/pipeline/runtime/loader-context.test.ts", {
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
check("25. consent-banner tests pass (writeConsentCookie clear-on-deny)", () => {
  try {
    execSync("npx vitest run app/_lib/analytics/pipeline/runtime/consent-banner.test.ts", {
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
check("26. AnalyticsLoader component tests pass (salt injection)", () => {
  try {
    execSync(
      "npx vitest run 'app/(guest)/_components/AnalyticsLoader.test.tsx'",
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
console.log("Repo health");
check("27. tsc clean for files touched in this PR (scoped check)", () => {
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
      "app/_lib/analytics/pipeline/runtime/loader-context",
      "app/_lib/analytics/pipeline/runtime/loader.ts",
      "app/_lib/analytics/pipeline/runtime/consent-banner",
      "app/(guest)/_components/AnalyticsLoader",
      "app/(guest)/layout.tsx",
      "app/api/webhooks/clerk/route.ts",
      "scripts/seed-test-tenant.ts",
      "scripts/sync-clerk-org.ts",
      "scripts/verify-loader-hardening",
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
check("28. eslint clean for files touched in this PR", () => {
  const targets = [
    "app/_lib/analytics/pipeline/tenant-settings.ts",
    "app/_lib/analytics/pipeline/tenant-settings.test.ts",
    "app/_lib/analytics/pipeline/runtime/loader-context.ts",
    "app/_lib/analytics/pipeline/runtime/loader-context.test.ts",
    "app/_lib/analytics/pipeline/runtime/loader.ts",
    "app/_lib/analytics/pipeline/runtime/consent-banner.ts",
    "app/_lib/analytics/pipeline/runtime/consent-banner.test.ts",
    "scripts/verify-loader-hardening.ts",
  ].join(" ");
  try {
    execSync(`npx eslint ${targets}`, { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    return {
      pass: false,
      reason:
        out.split("\n").find((l) => l.includes("error") || l.includes("problem")) ??
        "eslint errors",
    };
  }
});

if (SKIP_BUILD) {
  check("29. (skipped) npm run build", () => ({ pass: true, reason: "skipped" }));
} else if (isDevEnvWithDevOrgId()) {
  check("29. npm run build (skipped: DEV_ORG_ID present in .env)", () => ({
    pass: true,
    reason:
      "DEV_ORG_ID set — production build rejects it as a security risk; CI runs full build on Vercel preview",
  }));
} else {
  check("29. npm run build succeeds", () => {
    try {
      execSync("npm run build", { cwd: REPO_ROOT, stdio: "pipe" });
      return { pass: true, reason: "" };
    } catch (err) {
      const out =
        err instanceof Error && "stdout" in err
          ? String((err as { stdout: Buffer }).stdout)
          : "";
      return {
        pass: false,
        reason:
          out.split("\n").find((l) => /(error|fail)/i.test(l)) ?? "build failed",
      };
    }
  });
}

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
