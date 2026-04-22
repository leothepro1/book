/**
 * Post-deploy smoke tests.
 *
 * Parallel health probe against a deployed environment. Exits 0 if every
 * critical check passes, 1 otherwise. Designed for CI (GitHub Actions
 * triggered by Vercel deployment_status) and manual ops runs.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://rutgr.com npm run smoke
 *   SMOKE_BASE_URL=https://rutgr.com SMOKE_FORMAT=json npm run smoke
 *
 * Required env:
 *   SMOKE_BASE_URL        URL of the deployment to probe. https:// enforced
 *                         except for localhost/127.0.0.1.
 *
 * Optional env:
 *   SMOKE_TENANT_HOST     Tenant subdomain to probe (e.g.
 *                         apelviken-dev-x4k9mq.rutgr.com). Hostname or URL.
 *   CRON_SECRET           Verifies cron auth end-to-end. Without it, only
 *                         the negative cron-auth check runs (wrong-bearer
 *                         must 401). Never logged.
 *   SMOKE_TIMEOUT_MS      Per-request timeout (default 10000).
 *   SMOKE_FORMAT          "pretty" (default) or "json".
 *
 * Exit codes: 0 = all critical checks passed. 1 = any critical failure or
 * configuration error.
 */

import { performance } from "node:perf_hooks";

const DEFAULT_TIMEOUT_MS = 10_000;
const SUITE_TIMEOUT_MS = 120_000;
const USER_AGENT = "rutgr-smoke/1.0 (+post-deploy)";

type CheckStatus = "pass" | "fail";
type Method = "GET" | "HEAD" | "POST";
type ExpectedStatus = number | number[] | ((code: number) => boolean);

type CheckSpec = {
  name: string;
  critical: boolean;
  method: Method;
  url: string;
  expectedStatus: ExpectedStatus;
  timeoutMs?: number;
  headers?: Record<string, string>;
  validate?: (body: string, headers: Headers) => string | null;
  retryOnTransient?: boolean;
  /** Keys whose values must never appear in any output. */
  redact?: readonly string[];
};

type CheckResult = {
  name: string;
  critical: boolean;
  status: CheckStatus;
  statusCode: number | null;
  durationMs: number;
  message: string;
  attempts: number;
  repro: string;
};

// ──────────────────────────────────────────────────────────────
// Env + CLI parsing (fail-fast on bad config)
// ──────────────────────────────────────────────────────────────

function readEnv(key: string): string | undefined {
  const raw = process.env[key];
  return raw && raw.trim() ? raw.trim() : undefined;
}

function requireEnv(key: string): string {
  const v = readEnv(key);
  if (!v) die(`missing required env var ${key}`);
  return v;
}

function die(msg: string): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

function parseBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    die(`SMOKE_BASE_URL is not a valid URL: ${safeEcho(raw)}`);
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) {
    die(`SMOKE_BASE_URL must use https (got ${url.protocol} for ${url.hostname})`);
  }
  url.search = "";
  url.hash = "";
  return url;
}

function parseTenantHost(raw: string | undefined): URL | null {
  if (!raw) return null;
  const input = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    die(`SMOKE_TENANT_HOST is not valid: ${safeEcho(raw)}`);
  }
  url.search = "";
  url.hash = "";
  return url;
}

function parseTimeout(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 60_000) {
    die(`SMOKE_TIMEOUT_MS must be 1..60000 (got ${safeEcho(raw)})`);
  }
  return Math.floor(n);
}

/** Strip control chars from untrusted env input before echoing it. */
function safeEcho(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, "?").slice(0, 200);
}

// ──────────────────────────────────────────────────────────────
// Check execution
// ──────────────────────────────────────────────────────────────

async function runCheck(spec: CheckSpec): Promise<CheckResult> {
  const maxAttempts = spec.retryOnTransient ? 2 : 1;
  const overallStart = performance.now();
  let attempts = 0;
  let lastStatus: number | null = null;
  let lastMessage = "";

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const r = await doFetch(spec);
    lastStatus = r.statusCode;
    lastMessage = r.message;
    if (r.status === "pass") {
      return finalize(spec, "pass", r.statusCode, overallStart, attempts, "ok");
    }
    const transient = r.statusCode === null || (r.statusCode >= 500 && r.statusCode < 600);
    if (!transient) break;
    if (i < maxAttempts - 1) await sleep(1000);
  }

  return finalize(spec, "fail", lastStatus, overallStart, attempts, lastMessage);
}

function finalize(
  spec: CheckSpec,
  status: CheckStatus,
  statusCode: number | null,
  startedAt: number,
  attempts: number,
  message: string,
): CheckResult {
  return {
    name: spec.name,
    critical: spec.critical,
    status,
    statusCode,
    durationMs: Math.round(performance.now() - startedAt),
    message,
    attempts,
    repro: buildRepro(spec),
  };
}

async function doFetch(
  spec: CheckSpec,
): Promise<{ status: CheckStatus; statusCode: number | null; message: string }> {
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(spec.url, {
      method: spec.method,
      headers: {
        "user-agent": USER_AGENT,
        "accept": "*/*",
        "cache-control": "no-cache",
        ...spec.headers,
      },
      signal: ac.signal,
      redirect: "manual",
    });

    if (!matchesExpected(res.status, spec.expectedStatus)) {
      return {
        status: "fail",
        statusCode: res.status,
        message: `expected ${describeExpected(spec.expectedStatus)}, got ${res.status}`,
      };
    }

    if (spec.validate) {
      const body = await safeReadText(res);
      const problem = spec.validate(body, res.headers);
      if (problem) return { status: "fail", statusCode: res.status, message: problem };
    }

    return { status: "pass", statusCode: res.status, message: "ok" };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "fail", statusCode: null, message: `timeout after ${timeoutMs}ms` };
    }
    return {
      status: "fail",
      statusCode: null,
      message: `network: ${scrubError(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    // Cap body read to prevent unbounded memory on a misbehaving endpoint.
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 256 * 1024;
    while (total < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    try {
      await reader.cancel();
    } catch {
      /* noop */
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  } catch {
    return "";
  }
}

function matchesExpected(code: number, expected: ExpectedStatus): boolean {
  if (typeof expected === "number") return code === expected;
  if (typeof expected === "function") return expected(code);
  return expected.includes(code);
}

function describeExpected(expected: ExpectedStatus): string {
  if (typeof expected === "number") return `${expected}`;
  if (typeof expected === "function") return "custom";
  return expected.join("|");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Never let a stack trace or object inspection leak env values into stderr. */
function scrubError(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/\s+/g, " ").slice(0, 200);
  return String(err).slice(0, 200);
}

/** curl one-liner for debugging. Authorization headers are replaced with
 * a placeholder so failed-run logs never leak credentials. */
function buildRepro(spec: CheckSpec): string {
  const parts = ["curl", "-i", "-sS", "-A", shell(USER_AGENT)];
  if (spec.method !== "GET") parts.push("-X", spec.method);
  for (const [k, v] of Object.entries(spec.headers ?? {})) {
    const value = k.toLowerCase() === "authorization" ? "Bearer <redacted>" : v;
    parts.push("-H", shell(`${k}: ${value}`));
  }
  parts.push(shell(spec.url));
  return parts.join(" ");
}

function shell(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ──────────────────────────────────────────────────────────────
// Checks
// ──────────────────────────────────────────────────────────────

function buildChecks(
  baseUrl: URL,
  tenantHost: URL | null,
  cronSecret: string | undefined,
  timeoutMs: number,
): CheckSpec[] {
  const abs = (path: string) => new URL(path, baseUrl).toString();
  const checks: CheckSpec[] = [];

  // 1. Liveness — should always be 200. If this fails, the runtime is broken.
  checks.push({
    name: "liveness",
    critical: true,
    method: "GET",
    url: abs("/api/health"),
    expectedStatus: 200,
    timeoutMs,
    retryOnTransient: true,
    validate: (body) => {
      try {
        const parsed = JSON.parse(body);
        if (parsed?.status !== "ok") return `liveness returned status=${JSON.stringify(parsed?.status)}`;
        return null;
      } catch {
        return "liveness response not valid JSON";
      }
    },
  });

  // 2. Readiness — DB + Redis verified. 503 means something is down and
  // must fail the deploy; 200 means all dependencies respond.
  checks.push({
    name: "readiness",
    critical: true,
    method: "GET",
    url: abs("/api/health/ready"),
    expectedStatus: 200,
    timeoutMs: Math.max(timeoutMs, 15_000),
    retryOnTransient: true,
    validate: (body) => {
      try {
        const parsed = JSON.parse(body) as { status?: string; checks?: Array<{ name: string; status: string }> };
        if (parsed.status === "down") return `readiness down: ${summarizeDown(parsed.checks)}`;
        return null;
      } catch {
        return "readiness response not valid JSON";
      }
    },
  });

  // 3. Root — serves HTML (catches missing build output / server error).
  checks.push({
    name: "admin-root",
    critical: true,
    method: "GET",
    url: abs("/"),
    // Accept 2xx + 3xx — Clerk may redirect unauthenticated visitors to /sign-in.
    expectedStatus: (s) => s >= 200 && s < 400,
    timeoutMs: Math.max(timeoutMs, 15_000),
    retryOnTransient: true,
  });

  // 4. Sign-in — catches missing Clerk env vars / middleware errors.
  checks.push({
    name: "sign-in",
    critical: true,
    method: "GET",
    url: abs("/sign-in"),
    expectedStatus: (s) => s === 200 || (s >= 300 && s < 400),
    timeoutMs: Math.max(timeoutMs, 15_000),
    retryOnTransient: true,
  });

  // 5. Cron auth (negative) — wrong bearer must 401. Confirms the auth
  // check is actually wired up; do not retry (response is deterministic).
  checks.push({
    name: "cron-auth-rejects-bad-bearer",
    critical: true,
    method: "GET",
    url: abs("/api/cron/app-health-checks"),
    expectedStatus: [401, 403],
    timeoutMs,
    headers: { authorization: "Bearer smoke-test-definitely-not-real" },
    retryOnTransient: false,
  });

  // 6. Cron auth (positive) — only when CRON_SECRET is explicitly provided.
  if (cronSecret) {
    checks.push({
      name: "cron-auth-accepts-valid-bearer",
      critical: true,
      method: "GET",
      url: abs("/api/cron/app-health-checks"),
      expectedStatus: 200,
      timeoutMs: Math.max(timeoutMs, 20_000),
      headers: { authorization: `Bearer ${cronSecret}` },
      retryOnTransient: false,
    });
  }

  // 7. robots.txt — Next.js static (if present). Not critical.
  checks.push({
    name: "robots.txt",
    critical: false,
    method: "GET",
    url: abs("/robots.txt"),
    expectedStatus: [200, 404],
    timeoutMs,
    retryOnTransient: true,
  });

  // 8. Tenant storefront — optional, exercises subdomain routing + PMS
  // integration resolution + tenant config cache.
  if (tenantHost) {
    checks.push({
      name: "tenant-storefront",
      critical: true,
      method: "GET",
      url: tenantHost.toString(),
      expectedStatus: (s) => s >= 200 && s < 400,
      timeoutMs: Math.max(timeoutMs, 15_000),
      retryOnTransient: true,
    });
  }

  return checks;
}

function summarizeDown(checks: Array<{ name: string; status: string }> | undefined): string {
  if (!checks) return "unknown";
  const down = checks.filter((c) => c.status === "down").map((c) => c.name);
  return down.length > 0 ? down.join(",") : "no details";
}

// ──────────────────────────────────────────────────────────────
// Reporters
// ──────────────────────────────────────────────────────────────

function reportPretty(results: CheckResult[], totalMs: number, meta: Meta): void {
  const pad = (s: string, n: number) => s.padEnd(n, " ");
  const out = process.stdout;
  out.write("\n");
  out.write(`Smoke → ${meta.baseUrl}\n`);
  if (meta.tenantHost) out.write(`Tenant → ${meta.tenantHost}\n`);
  out.write("─".repeat(72) + "\n");
  for (const r of results) {
    const icon = r.status === "pass" ? "PASS" : r.critical ? "FAIL" : "WARN";
    const code = r.statusCode === null ? "—" : String(r.statusCode);
    const dur = `${r.durationMs}ms`;
    const suffix = r.status === "fail" ? `  ${r.message}` : "";
    out.write(`  ${pad(icon, 4)}  ${pad(r.name, 38)} ${pad(code, 4)}  ${pad(dur, 8)}${suffix}\n`);
  }
  const counts = countResults(results);
  out.write("─".repeat(72) + "\n");
  out.write(
    `  ${counts.total} checks • ${counts.passed} passed • ${counts.failed} failed` +
      ` (${counts.criticalFailed} critical) • ${totalMs}ms\n`,
  );
  if (counts.criticalFailed > 0) {
    out.write("\nReproduce failing checks:\n");
    for (const r of results) {
      if (r.status === "fail" && r.critical) {
        out.write(`  # ${r.name} → ${r.message}\n`);
        out.write(`  ${r.repro}\n`);
      }
    }
  }
  out.write("\n");
}

function reportJson(results: CheckResult[], totalMs: number, meta: Meta): void {
  const counts = countResults(results);
  const payload = {
    ok: counts.criticalFailed === 0,
    timestamp: new Date().toISOString(),
    baseUrl: meta.baseUrl,
    tenantHost: meta.tenantHost,
    totalMs,
    counts,
    checks: results.map((r) => ({
      name: r.name,
      critical: r.critical,
      status: r.status,
      statusCode: r.statusCode,
      durationMs: r.durationMs,
      attempts: r.attempts,
      message: r.message,
    })),
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

function countResults(results: CheckResult[]) {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    criticalFailed: results.filter((r) => r.status === "fail" && r.critical).length,
  };
}

type Meta = { baseUrl: string; tenantHost: string | null };

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = parseBaseUrl(requireEnv("SMOKE_BASE_URL"));
  const tenantHost = parseTenantHost(readEnv("SMOKE_TENANT_HOST"));
  const format = (readEnv("SMOKE_FORMAT") ?? "pretty").toLowerCase();
  const timeoutMs = parseTimeout(readEnv("SMOKE_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS);
  const cronSecret = readEnv("CRON_SECRET");

  if (format !== "pretty" && format !== "json") {
    die(`SMOKE_FORMAT must be "pretty" or "json" (got ${safeEcho(format)})`);
  }

  const checks = buildChecks(baseUrl, tenantHost, cronSecret, timeoutMs);

  // Hard ceiling on total runtime — if a probe hangs past this, kill the process.
  const suiteTimer = setTimeout(() => {
    process.stderr.write(`ERROR: suite exceeded ${SUITE_TIMEOUT_MS}ms — aborting\n`);
    process.exit(1);
  }, SUITE_TIMEOUT_MS);
  suiteTimer.unref?.();

  const start = performance.now();
  const settled = await Promise.allSettled(checks.map(runCheck));
  const totalMs = Math.round(performance.now() - start);
  clearTimeout(suiteTimer);

  const results: CheckResult[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      name: checks[i].name,
      critical: checks[i].critical,
      status: "fail" as const,
      statusCode: null,
      durationMs: 0,
      message: `runner crash: ${scrubError(r.reason)}`,
      attempts: 0,
      repro: buildRepro(checks[i]),
    };
  });

  const meta: Meta = {
    baseUrl: baseUrl.toString(),
    tenantHost: tenantHost ? tenantHost.toString() : null,
  };

  if (format === "json") reportJson(results, totalMs, meta);
  else reportPretty(results, totalMs, meta);

  const anyCriticalFailed = results.some((r) => r.status === "fail" && r.critical);
  process.exit(anyCriticalFailed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${scrubError(err)}\n`);
  process.exit(1);
});
