/**
 * /api/analytics/collect — geo-enrichment integration tests (PR-X3b).
 *
 * Scope:
 *   - Verify geo-lookup runs ONLY after the consent gate + the
 *     feature-flag gate succeed.
 *   - Verify the resolved geo lands in the `context` argument passed
 *     to `emitAnalyticsEventStandalone` as `{ geo: { country, city } }`.
 *   - Verify failure-graceful behaviour: lookup returning `null` →
 *     emit proceeds with `context: undefined` (X3a undefined→NULL
 *     contract), never with `{}`.
 *   - Verify privacy boundary: geo-lookup is never invoked when
 *     consent is declined, the feature flag is off, or the request
 *     is rate-limited.
 *
 * The full pre-X3b route (origin, tenant resolution, rate limit,
 * envelope shape, registry validation) is exercised by the existing
 * suite in scripts/verify-phase3*.ts. These tests focus on the
 * single new behaviour PR-X3b adds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks for collaborators ──────────────────────────────────────────────

vi.mock("@/app/(guest)/_lib/tenant/resolveTenantFromHost", () => ({
  resolveTenantFromHost: vi.fn(),
}));

vi.mock("@/app/_lib/analytics/pipeline/origin-check", () => ({
  checkAnalyticsOrigin: vi.fn(() => ({ ok: true, host: "test.rutgr.com" })),
}));

vi.mock("@/app/_lib/analytics/pipeline/rate-limit", () => ({
  checkAnalyticsRateLimit: vi.fn(async () => ({
    allowed: true,
    retryAfterSeconds: 0,
    scope: "none" as const,
  })),
}));

vi.mock("@/app/_lib/analytics/pipeline/feature-flag", () => ({
  isAnalyticsEnabledForTenant: vi.fn(async () => true),
}));

vi.mock("@/app/_lib/analytics/pipeline/emitter", () => ({
  emitAnalyticsEventStandalone: vi.fn(async () => ({
    event_id: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
    outbox_id: "outbox_test_id",
  })),
}));

vi.mock("@/app/_lib/analytics/pipeline/geo", () => ({
  resolveGeoForContext: vi.fn(),
}));

vi.mock("@/app/_lib/platform/constants", () => ({
  getPlatformBaseDomain: () => "rutgr.com",
}));

vi.mock("@/app/_lib/logger", () => ({
  log: vi.fn(),
}));

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { emitAnalyticsEventStandalone } from "@/app/_lib/analytics/pipeline/emitter";
import { isAnalyticsEnabledForTenant } from "@/app/_lib/analytics/pipeline/feature-flag";
import { resolveGeoForContext } from "@/app/_lib/analytics/pipeline/geo";
import { checkAnalyticsRateLimit } from "@/app/_lib/analytics/pipeline/rate-limit";

import { POST } from "./route";

const TENANT_ID = "ctenant1aaaaaaaaaaaaaaaaa";

const VALID_BODY = {
  event_id: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7AA",
  event_name: "page_viewed",
  schema_version: "0.1.0",
  occurred_at: "2026-06-01T12:00:00.000Z",
  payload: {
    page_url: "https://test.rutgr.com/",
    page_referrer: "",
    user_agent_hash: "ua_a3f7b2c1d4e5f6a7",
    viewport: { width: 1440, height: 900 },
    locale: "sv-SE",
    session_id: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7BB",
    page_type: "stay",
  },
};

const CONSENT_GRANTED = encodeURIComponent(
  JSON.stringify({ essential: true, analytics: true, marketing: false }),
);
const CONSENT_DECLINED = encodeURIComponent(
  JSON.stringify({ essential: true, analytics: false, marketing: false }),
);

function makeRequest(opts?: {
  body?: unknown;
  consentCookie?: string;
  ip?: string;
}): Request {
  const body = JSON.stringify(opts?.body ?? VALID_BODY);
  const headers: Record<string, string> = {
    host: "test.rutgr.com",
    origin: "https://test.rutgr.com",
    "content-type": "application/json",
    "x-forwarded-for": opts?.ip ?? "203.0.113.42, 10.0.0.1",
  };
  if (opts?.consentCookie) {
    headers.cookie = `bf_consent=${opts.consentCookie}`;
  }
  return new Request("https://test.rutgr.com/api/analytics/collect", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  vi.mocked(resolveTenantFromHost).mockResolvedValue({
    id: TENANT_ID,
    slug: "test",
    portalSlug: "test",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(checkAnalyticsRateLimit).mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
    scope: "none",
  });
  vi.mocked(isAnalyticsEnabledForTenant).mockResolvedValue(true);
  vi.mocked(emitAnalyticsEventStandalone).mockResolvedValue({
    event_id: VALID_BODY.event_id,
    outbox_id: "outbox_test_id",
  });
  vi.mocked(resolveGeoForContext).mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/analytics/collect — geo enrichment (PR-X3b)", () => {
  it("emits with context: { geo } when consent + flag + DB lookup all succeed", async () => {
    vi.mocked(resolveGeoForContext).mockResolvedValue({
      country: "SE",
      city: "Apelviken",
    });

    const res = await POST(
      makeRequest({ consentCookie: CONSENT_GRANTED, ip: "203.0.113.42" }),
    );
    expect(res.status).toBe(204);
    expect(emitAnalyticsEventStandalone).toHaveBeenCalledTimes(1);
    const call = vi.mocked(emitAnalyticsEventStandalone).mock.calls[0]![0];
    expect(call.context).toEqual({ geo: { country: "SE", city: "Apelviken" } });
  });

  it("emits with context: undefined when geo lookup returns null (DB absent or no match)", async () => {
    vi.mocked(resolveGeoForContext).mockResolvedValue(null);

    const res = await POST(
      makeRequest({ consentCookie: CONSENT_GRANTED, ip: "10.0.0.1" }),
    );
    expect(res.status).toBe(204);
    expect(emitAnalyticsEventStandalone).toHaveBeenCalledTimes(1);
    const call = vi.mocked(emitAnalyticsEventStandalone).mock.calls[0]![0];
    // Critical contract: undefined, never `{}` — preserves the X3a
    // undefined→SQL NULL distinction at the outbox layer.
    expect(call.context).toBeUndefined();
  });

  it("does NOT invoke geo lookup when consent is declined", async () => {
    const res = await POST(
      makeRequest({ consentCookie: CONSENT_DECLINED, ip: "203.0.113.42" }),
    );
    expect(res.status).toBe(403);
    expect(resolveGeoForContext).not.toHaveBeenCalled();
    expect(emitAnalyticsEventStandalone).not.toHaveBeenCalled();
  });

  it("does NOT invoke geo lookup when no consent cookie is present", async () => {
    const res = await POST(makeRequest({ ip: "203.0.113.42" }));
    expect(res.status).toBe(403);
    expect(resolveGeoForContext).not.toHaveBeenCalled();
    expect(emitAnalyticsEventStandalone).not.toHaveBeenCalled();
  });

  it("does NOT invoke geo lookup when the per-tenant pipeline flag is off", async () => {
    vi.mocked(isAnalyticsEnabledForTenant).mockResolvedValue(false);
    const res = await POST(
      makeRequest({ consentCookie: CONSENT_GRANTED, ip: "203.0.113.42" }),
    );
    expect(res.status).toBe(403);
    expect(resolveGeoForContext).not.toHaveBeenCalled();
    expect(emitAnalyticsEventStandalone).not.toHaveBeenCalled();
  });

  it("does NOT invoke geo lookup when the request is rate-limited", async () => {
    vi.mocked(checkAnalyticsRateLimit).mockResolvedValue({
      allowed: false,
      scope: "tenant" as const,
      retryAfterSeconds: 60,
    });
    const res = await POST(
      makeRequest({ consentCookie: CONSENT_GRANTED, ip: "203.0.113.42" }),
    );
    expect(res.status).toBe(429);
    expect(resolveGeoForContext).not.toHaveBeenCalled();
    expect(emitAnalyticsEventStandalone).not.toHaveBeenCalled();
  });

  it("does NOT invoke geo lookup when origin check fails", async () => {
    const { checkAnalyticsOrigin } = await import(
      "@/app/_lib/analytics/pipeline/origin-check"
    );
    vi.mocked(checkAnalyticsOrigin).mockReturnValueOnce({
      ok: false,
      reason: "host_missing" as const,
    });
    const res = await POST(
      makeRequest({ consentCookie: CONSENT_GRANTED, ip: "203.0.113.42" }),
    );
    expect(res.status).toBe(401);
    expect(resolveGeoForContext).not.toHaveBeenCalled();
  });

  it("passes the X-Forwarded-For first hop to the geo helper, not subsequent IPs", async () => {
    vi.mocked(resolveGeoForContext).mockResolvedValue({
      country: "SE",
      city: "Apelviken",
    });
    await POST(
      makeRequest({
        consentCookie: CONSENT_GRANTED,
        ip: "203.0.113.42, 10.0.0.1, 172.16.0.1",
      }),
    );
    expect(resolveGeoForContext).toHaveBeenCalledWith(
      "203.0.113.42",
      TENANT_ID,
    );
  });

  it("emit succeeds even when geo helper rejects unexpectedly (defense in depth)", async () => {
    // The helper documents itself as "never throws" (failures return
    // null). A contract violation here must NOT abort the emit —
    // geo is enrichment, not core data. The route's defense-in-depth
    // try/catch swallows the rejection, omits the geo field, and
    // proceeds.
    vi.mocked(resolveGeoForContext).mockRejectedValue(
      new Error("unexpected"),
    );
    const res = await POST(
      makeRequest({ consentCookie: CONSENT_GRANTED, ip: "203.0.113.42" }),
    );
    expect(res.status).toBe(204);
    expect(emitAnalyticsEventStandalone).toHaveBeenCalledTimes(1);
    const call = vi.mocked(emitAnalyticsEventStandalone).mock.calls[0]![0];
    // Contract violation → no geo on the event; emit proceeds with
    // context: undefined, identical to a clean lookup that returned null.
    expect(call.context).toBeUndefined();
  });
});
