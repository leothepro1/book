export const dynamic = "force-dynamic";

/**
 * PMS Webhook Receiver (provider-agnostic)
 * ══════════════════════════════════════════
 *
 *   POST /api/webhooks/pms/mews        — Mews reservation events
 *   POST /api/webhooks/pms/fake        — development tests
 *
 * The route is a thin edge: its job is to authenticate the request,
 * map it onto a tenant, and hand the event(s) to processPmsWebhook().
 * All business logic — dedup, inbox, re-fetch, upsert — lives in
 * app/_lib/integrations/reliability/webhook.ts and is unit-tested
 * without HTTP.
 *
 * Response contract:
 *
 *   200 — event(s) accepted (inboxed + optionally processed). Return
 *         fast so the PMS doesn't timeout-retry. The "ok" flag + the
 *         counters let the PMS's own logs show progress.
 *
 *   401 — signature invalid. PMS may retry (config fix on their side
 *         may make the next delivery pass). We log with enough context
 *         to triage attacker probing vs legitimate misconfiguration.
 *
 *   404 — tenant cannot be resolved from payload. Returns 200 in
 *         practice (see below) — we DON'T want PMS to retry forever
 *         for an enterprise we no longer host.
 *
 *   400 — payload malformed (adapter's parseWebhookEvents returned
 *         null). PMS retry won't help; we ack and move on.
 *
 *   429 — rate-limited. PMS should back off and retry.
 *
 *   5xx — our DB is down or similar transient failure. PMS retries.
 *
 * Security:
 *
 *   • The tenant is resolved from the PAYLOAD (not from URL/cookie/
 *     session). An attacker cannot pick which tenant they target.
 *   • Signature verification is adapter-owned — Mews uses an URL token,
 *     others use HMAC — so this route stays provider-neutral.
 *   • Raw body is captured BEFORE JSON parse so the signature covers
 *     the exact bytes the PMS signed.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/app/_lib/redis/client";
import { log } from "@/app/_lib/logger";
import { getAdapter } from "@/app/_lib/integrations/registry";
import { decryptCredentials } from "@/app/_lib/integrations/crypto";
import { PmsProviderSchema, type PmsProvider } from "@/app/_lib/integrations/types";
import { resolveWebhookExternalTenant } from "@/app/_lib/integrations/webhook-tenant";
import { processPmsWebhook } from "@/app/_lib/integrations/reliability/webhook";

// ── Rate limiter (per-tenant, Upstash-backed, dev-bypass) ───

const webhookLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(600, "1 m"), // 10/sec average, bursts ok
  analytics: true,
  prefix: "bedfront:ratelimit:pms-webhook",
});

async function checkTenantRateLimit(tenantId: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  try {
    const { success } = await webhookLimiter.limit(`tenant:${tenantId}`);
    return success;
  } catch (err) {
    // Fail-open — never deny a real booking event because Redis is
    // down. DDoS risk is low since the signature gate still applies.
    log("warn", "pms.webhook.ratelimit_check_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

// ── Sync processing budget ──────────────────────────────────
//
// Keep comfortably under Vercel's 10s hobby / 60s pro default so we
// can always ack the PMS before it times out. Anything not processed
// in this budget falls through to the retry cron.

const WEBHOOK_PROCESSING_BUDGET_MS = 8_000;

// ── Body size ceiling ───────────────────────────────────────
//
// Legitimate PMS webhooks are KB-scale (a handful of reservation IDs
// in Mews's case). A 1 MB ceiling rejects malformed or abusive
// traffic long before it pressures our memory. Checked against
// Content-Length before we call req.text(), so oversized bodies
// never get buffered.

const MAX_BODY_BYTES = 1_000_000;

// ── Entry ───────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerKey } = await params;

  // Validate provider against the allowed enum. An unknown value
  // short-circuits before we even look up a tenant.
  const providerParsed = PmsProviderSchema.safeParse(providerKey);
  if (!providerParsed.success) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  const provider: PmsProvider = providerParsed.data;

  // Body size guard — reject oversized payloads BEFORE buffering.
  // Content-Length is advisory (PMS may send chunked), so we also
  // clamp at read time via a byte count check.
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      log("warn", "pms.webhook.body_too_large", {
        provider: providerKey,
        declaredBytes: declared,
      });
      return Response.json(
        { error: "Payload too large" },
        { status: 413 },
      );
    }
  }

  // Raw body first — signature verification needs the exact bytes.
  // req.text() drains the stream; we rebuild the Buffer from it.
  let rawBodyStr: string;
  try {
    rawBodyStr = await req.text();
  } catch {
    return Response.json({ error: "Body read failed" }, { status: 400 });
  }

  // Post-read clamp catches payloads without Content-Length or
  // intentionally misreporting it.
  if (Buffer.byteLength(rawBodyStr, "utf8") > MAX_BODY_BYTES) {
    log("warn", "pms.webhook.body_too_large_post_read", {
      provider: providerKey,
      actualBytes: Buffer.byteLength(rawBodyStr, "utf8"),
    });
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = Buffer.from(rawBodyStr, "utf8");

  // Parse JSON with guard. Malformed body → 400.
  let parsedPayload: unknown;
  try {
    parsedPayload = rawBodyStr.length > 0 ? JSON.parse(rawBodyStr) : null;
  } catch {
    log("warn", "pms.webhook.invalid_json", { provider });
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  // Flatten headers for the adapter. Lower-cased keys: HTTP headers
  // are case-insensitive and adapters shouldn't have to remember that.
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  // Mews delivers the webhook token as a URL query param; surface it
  // to adapters via headers so they don't need URL-parsing logic.
  const url = new URL(req.url);
  const urlToken = url.searchParams.get("token");
  if (urlToken && !headers["x-forwarded-token"]) {
    headers["x-forwarded-token"] = urlToken;
  }

  // ── Resolve tenant from payload (credential-free lookup) ──
  //
  // Signature is NOT verified yet. We trust nothing from the payload
  // except the EnterpriseId so we can look up which tenant's
  // credentials to use for the signature check.

  const externalTenantId = resolveWebhookExternalTenant(provider, parsedPayload);

  if (!externalTenantId) {
    log("warn", "pms.webhook.tenant_unresolved", { provider });
    return Response.json(
      { error: "Tenant could not be resolved from payload" },
      { status: 400 },
    );
  }

  // Map the PMS's tenant ID (Mews EnterpriseId etc.) to our tenant.
  const integration = await prisma.tenantIntegration.findFirst({
    where: {
      provider,
      externalTenantId,
    },
  });

  if (!integration) {
    // We don't host this enterprise (maybe they disconnected).
    // Respond 200 so the PMS stops retrying; the event is gone but
    // since we don't have a tenant for it, there's nothing to lose.
    log("info", "pms.webhook.tenant_unknown", { provider, externalTenantId });
    return Response.json(
      { ok: true, note: "tenant not hosted" },
      { status: 200 },
    );
  }

  const tenantId = integration.tenantId;

  // Kill-switch: tenant opted out of webhook intake (incident response,
  // misconfigured PMS spamming bad events, etc.). Return 200 so the
  // PMS stops retrying; the reconciliation cron still maintains
  // correctness by pulling from the PMS on its own schedule.
  if (!integration.webhookEnabled) {
    log("info", "pms.webhook.disabled_for_tenant", { tenantId, provider });
    return Response.json(
      { ok: true, note: "webhook intake disabled for tenant" },
      { status: 200 },
    );
  }

  // ── Rate limit (per-tenant) ───────────────────────────────

  if (!(await checkTenantRateLimit(tenantId))) {
    log("warn", "pms.webhook.rate_limited", { tenantId, provider });
    return Response.json({ error: "Rate limited" }, { status: 429 });
  }

  // ── Signature verification (adapter + real credentials) ──

  const credentials = integration.credentialsEncrypted
    ? decryptCredentials(
        Buffer.from(integration.credentialsEncrypted),
        Buffer.from(integration.credentialsIv),
      )
    : {};

  const realAdapter = getAdapter(provider, credentials);

  const signatureOk = await realAdapter.verifyWebhookSignature(
    rawBody,
    headers,
    credentials,
  );
  if (!signatureOk) {
    log("warn", "pms.webhook.signature_invalid", {
      tenantId,
      provider,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse events (adapter owns payload shape) ────────────

  const events = realAdapter.parseWebhookEvents(rawBody, parsedPayload);
  if (events === null) {
    log("warn", "pms.webhook.parse_failed", {
      tenantId,
      provider,
    });
    return Response.json({ error: "Malformed payload" }, { status: 400 });
  }

  if (events.length === 0) {
    log("info", "pms.webhook.no_actionable_events", {
      tenantId,
      provider,
    });
    return Response.json({ ok: true, eventsReceived: 0 }, { status: 200 });
  }

  // ── Process (inbox + synchronous attempt within budget) ──

  const startedAt = Date.now();
  try {
    const result = await processPmsWebhook({
      tenantId,
      provider,
      events,
      rawPayload: parsedPayload,
      processingBudgetMs: WEBHOOK_PROCESSING_BUDGET_MS,
    });

    log("info", "pms.webhook.accepted", {
      tenantId,
      provider,
      durationMs: Date.now() - startedAt,
      ...result,
    });

    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    // DB or other infrastructure error — let the PMS retry. Logging
    // is critical here: every 5xx that passes through this point is
    // potential data loss if retries later fail too.
    log("error", "pms.webhook.infrastructure_error", {
      tenantId,
      provider,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "Processing failed — retry expected" },
      { status: 503 },
    );
  }
}
