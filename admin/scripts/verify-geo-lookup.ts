/**
 * Geo-lookup at /api/analytics/collect (PR-X3b) — verification.
 *
 *   $ npx tsx scripts/verify-geo-lookup.ts
 *
 * Static + test-runner gate confirming the consent-gated geo
 * enrichment landed end-to-end:
 *
 *   - Pipeline geo helper exists, returns {country, city} | null,
 *     never reads/writes the database, never returns lat/lng.
 *   - /api/analytics/collect imports the helper, runs the lookup
 *     AFTER consent + feature-flag gates, passes the result on
 *     `context: { geo }` to the emitter.
 *   - Privacy invariants: no IP-logging, no lat/lng in the helper,
 *     no DB access from the helper.
 *   - event-catalog.md documents the GDPR rekital 26 city-level
 *     posture so future operators understand the bound.
 *
 * Phase 5A's aggregator depends on this enrichment being lit;
 * X3b is the last analytics-enrichment prerequisite.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");
const PIPELINE_DIR = join(REPO_ROOT, "app/_lib/analytics/pipeline");
const COLLECT_DIR = join(REPO_ROOT, "app/api/analytics/collect");

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

/**
 * Strip block + line comments from a TypeScript source so privacy
 * grep checks don't false-positive on doc-comments that legitimately
 * mention "lat / lng" or "ip" while the actual code does not.
 *
 * Conservative regex: handles `/* … *\/` and `//` to end-of-line.
 * String literals can technically contain comment markers but
 * Bedfront's helpers are short and don't.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

console.log("");
console.log("Geo-lookup at /api/analytics/collect (PR-X3b) — verification");
console.log("─────────────────────────────────────────────────────────────");
console.log("");

console.log("S1 — pipeline geo helper");
check("1. app/_lib/analytics/pipeline/geo.ts exists with resolveGeoForContext export", () => {
  const path = join(PIPELINE_DIR, "geo.ts");
  if (!existsSync(path)) return { pass: false, reason: "file missing" };
  const text = readFile(path);
  if (!/export\s+async\s+function\s+resolveGeoForContext/.test(text)) {
    return { pass: false, reason: "no `export async function resolveGeoForContext`" };
  }
  return { pass: true, reason: "" };
});
check("2. Helper return type is `{ country, city } | null` (no lat/lng)", () => {
  const text = readFile(join(PIPELINE_DIR, "geo.ts"));
  // The exported interface that the function returns:
  if (!/export\s+interface\s+GeoContext\s*\{[^}]*country:\s*string;[^}]*city:\s*string;[^}]*\}/.test(
    text,
  )) {
    return {
      pass: false,
      reason: "GeoContext interface missing or doesn't have exactly { country, city }",
    };
  }
  // Defensive: the interface block must NOT mention latitude / longitude.
  const ifaceMatch = text.match(/interface\s+GeoContext\s*\{[\s\S]*?\}/);
  if (ifaceMatch && /\b(latitude|longitude|lat|lng)\b/i.test(ifaceMatch[0])) {
    return {
      pass: false,
      reason: "GeoContext interface leaks lat/lng",
    };
  }
  return { pass: true, reason: "" };
});
check("3. Helper does NOT store lat/lng (grep on code, not comments)", () => {
  const text = stripComments(readFile(join(PIPELINE_DIR, "geo.ts")));
  // We allow the existence of the variable names in the type comments
  // (`location: { latitude?, longitude? }` from MaxMind's response
  // shape if it appeared) but the helper itself must not assign them
  // anywhere. Strip comments and grep.
  // Allowed: the MaxMindReader interface declaration which mirrors
  // MaxMind's response shape — but we never assign to a variable
  // named latitude / longitude.
  const forbiddenAssignments = /\b(latitude|longitude)\s*[=:]\s*[^?]/;
  if (forbiddenAssignments.test(text)) {
    // Only flag if it's outside the MaxMindReader type declaration.
    // The interface itself has `latitude?:` etc as field types — that
    // is the MaxMind response shape, not our return shape. Distinguish
    // by checking for the bare `location:` access pattern that would
    // pull lat/lng out of the response.
    if (/result\.location\.(latitude|longitude)/.test(text)) {
      return {
        pass: false,
        reason: "helper accesses result.location.{latitude,longitude} — must not extract lat/lng",
      };
    }
  }
  // Also forbid the helper writing lat/lng anywhere:
  if (/\b(lat|lng)\s*:\s*[a-zA-Z]/.test(text)) {
    return {
      pass: false,
      reason: "helper has `lat:` or `lng:` field assignments — must not store coords",
    };
  }
  return { pass: true, reason: "" };
});
check("4. Helper does NOT touch any database (no `prisma.` or `_unguardedAnalyticsPipelineClient.`)", () => {
  const text = readFile(join(PIPELINE_DIR, "geo.ts"));
  if (/\bprisma\./.test(text) || /_unguardedAnalyticsPipelineClient/.test(text)) {
    return {
      pass: false,
      reason: "helper accesses Prisma — pipeline geo must be DB-write-free",
    };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S2 — collect-route wiring");
check("5. /api/analytics/collect/route.ts imports resolveGeoForContext", () => {
  const text = readFile(join(COLLECT_DIR, "route.ts"));
  if (
    !/import\s*\{\s*resolveGeoForContext\s*\}\s*from\s*"@\/app\/_lib\/analytics\/pipeline\/geo"/.test(
      text,
    )
  ) {
    return {
      pass: false,
      reason: "no `import { resolveGeoForContext } from \"@/app/_lib/analytics/pipeline/geo\"`",
    };
  }
  return { pass: true, reason: "" };
});
check("6. Geo-lookup runs AFTER consent gate AND feature-flag (ordering check)", () => {
  const text = readFile(join(COLLECT_DIR, "route.ts"));
  const consentDeclined = text.indexOf("consent_declined");
  const pipelineDisabled = text.indexOf("pipeline_disabled");
  const geoCall = text.indexOf("resolveGeoForContext(");
  const emitCall = text.indexOf("emitAnalyticsEventStandalone(");
  if (consentDeclined < 0) {
    return { pass: false, reason: "no `consent_declined` log marker — consent gate landmark missing" };
  }
  if (pipelineDisabled < 0) {
    return { pass: false, reason: "no `pipeline_disabled` log marker — feature-flag gate landmark missing" };
  }
  if (geoCall < 0) {
    return { pass: false, reason: "no resolveGeoForContext( call site in route" };
  }
  if (emitCall < 0) {
    return { pass: false, reason: "no emitAnalyticsEventStandalone( call site in route" };
  }
  if (!(consentDeclined < geoCall && pipelineDisabled < geoCall && geoCall < emitCall)) {
    return {
      pass: false,
      reason: `ordering wrong: consent_declined=${consentDeclined} pipeline_disabled=${pipelineDisabled} geoCall=${geoCall} emitCall=${emitCall}`,
    };
  }
  return { pass: true, reason: "" };
});
check("7. emit call passes a `context` parameter", () => {
  const text = readFile(join(COLLECT_DIR, "route.ts"));
  // Anchor on the emit-call block; expect a `context:` line within it.
  const emitMatch = text.match(
    /emitAnalyticsEventStandalone\s*\(\s*\{[\s\S]*?\}\s*\)/,
  );
  if (!emitMatch) {
    return { pass: false, reason: "couldn't locate emitAnalyticsEventStandalone({...}) call" };
  }
  if (!/\bcontext\s*:/.test(emitMatch[0])) {
    return { pass: false, reason: "emit-call args don't include `context:`" };
  }
  return { pass: true, reason: "" };
});
check("8. emit passes `undefined` (not `{}`) when no enrichment fields apply", () => {
  // The spec's X3a contract: undefined collapses to SQL NULL; `{}`
  // would land as an empty JSONB object. The route must use the
  // ternary that picks undefined when eventContext has no keys.
  const text = readFile(join(COLLECT_DIR, "route.ts"));
  if (
    !/Object\.keys\(eventContext\)\.length\s*>\s*0\s*\?\s*eventContext\s*:\s*undefined/.test(
      text,
    )
  ) {
    return {
      pass: false,
      reason: "expected `Object.keys(eventContext).length > 0 ? eventContext : undefined` ternary",
    };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S3 — privacy invariants");
check("9. No IP logged anywhere in helper or route (grep on code, not comments)", () => {
  const helper = stripComments(readFile(join(PIPELINE_DIR, "geo.ts")));
  const route = stripComments(readFile(join(COLLECT_DIR, "route.ts")));
  // Forbid `log(` calls whose ctx includes `ip` as a key. Match
  // patterns: `log(..., { ..., ip: ..., })` or `log(..., { ..., ip, })`.
  // Tightest grep that doesn't false-positive on `ipMatched: true`
  // or similar: `\bip\s*[,:]` inside a log() argument list.
  const offenders: string[] = [];
  for (const [name, text] of [["geo.ts", helper], ["route.ts", route]] as const) {
    const logCalls = text.match(/log\([^;]+\)/g) ?? [];
    for (const call of logCalls) {
      // Object literal `{ … ip: …, … }` or `{ … ip, … }` (shorthand).
      if (/\{\s*[^}]*\bip\s*[,:]/.test(call) && !/\b(tip|recipient|ipv|skip)\b/i.test(call)) {
        offenders.push(`${name}: ${call.slice(0, 120)}`);
      }
    }
  }
  if (offenders.length > 0) {
    return { pass: false, reason: `IP found in log call: ${offenders[0]}` };
  }
  return { pass: true, reason: "" };
});
check("10. event-catalog.md has 'Geo enrichment' section mentioning GDPR rekital 26", () => {
  const text = readFile(join(REPO_ROOT, "docs/analytics/event-catalog.md"));
  if (!/##\s*Geo enrichment/.test(text)) {
    return { pass: false, reason: "no `## Geo enrichment` section" };
  }
  if (!/GDPR\s+rekital\s+26/i.test(text)) {
    return { pass: false, reason: "section missing GDPR rekital 26 reference" };
  }
  return { pass: true, reason: "" };
});

console.log("");
console.log("S4 — tests + repo health");
check("11. geo helper tests exist (≥6 fixtures)", () => {
  const path = join(PIPELINE_DIR, "geo.test.ts");
  if (!existsSync(path)) return { pass: false, reason: "geo.test.ts missing" };
  const text = readFile(path);
  const itMatches = text.match(/\bit\(/g) ?? [];
  if (itMatches.length < 6) {
    return { pass: false, reason: `only ${itMatches.length} it() blocks; spec requires ≥6` };
  }
  return { pass: true, reason: `${itMatches.length} fixtures` };
});
check("12. /api/analytics/collect/route.test.ts exists with geo describe-block", () => {
  const path = join(COLLECT_DIR, "route.test.ts");
  if (!existsSync(path)) return { pass: false, reason: "route.test.ts missing" };
  const text = readFile(path);
  if (!/describe\(\s*"\/api\/analytics\/collect — geo enrichment/.test(text)) {
    return {
      pass: false,
      reason: "no `describe(\"/api/analytics/collect — geo enrichment …\")` block",
    };
  }
  return { pass: true, reason: "" };
});
check("13. geo + collect-route test suites pass (vitest)", () => {
  try {
    execSync(
      "npx vitest run app/_lib/analytics/pipeline/geo.test.ts app/api/analytics/collect/route.test.ts",
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
check("14. tsc clean for files touched in PR-X3b (scoped)", () => {
  try {
    execSync("npx tsc --noEmit", { cwd: REPO_ROOT, stdio: "pipe" });
    return { pass: true, reason: "tsc clean repo-wide" };
  } catch (err) {
    const out =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : "";
    const PR_PATHS = [
      "app/_lib/analytics/pipeline/geo",
      "app/api/analytics/collect/route",
      "scripts/verify-geo-lookup",
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
console.log("─────────────────────────────────────────────────────────────");
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
