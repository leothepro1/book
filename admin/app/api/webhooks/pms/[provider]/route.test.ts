import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock everything the route touches ──────────────────────

const mockIntegrationFindFirst = vi.fn();
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenantIntegration: {
      findFirst: (...a: unknown[]) => mockIntegrationFindFirst(...a),
    },
  },
}));

vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

// env.CRON_SECRET is not used by this route but env module is still
// loaded transitively.
vi.mock("@/app/_lib/env", () => ({ env: {} }));

// decryptCredentials: return a stub object (contents don't matter —
// the adapter's verify/parse mocks drive the test outcomes).
vi.mock("@/app/_lib/integrations/crypto", () => ({
  decryptCredentials: () => ({ webhookToken: "secret-token" }),
}));

// Rate limiter: default to always-pass. Individual tests override.
const mockRatelimitLimit = vi.fn<
  (identifier: string) => Promise<{ success: boolean }>
>(async () => ({ success: true }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    async limit(identifier: string) {
      return mockRatelimitLimit(identifier);
    }
    static slidingWindow() {
      return {};
    }
  },
}));
vi.mock("@/app/_lib/redis/client", () => ({ redis: {} }));

// Adapter: full control via mocks.
const mockVerifyWebhookSignature = vi.fn();
const mockParseWebhookEvents = vi.fn();
vi.mock("@/app/_lib/integrations/registry", () => ({
  getAdapter: () => ({
    verifyWebhookSignature: (...a: unknown[]) =>
      mockVerifyWebhookSignature(...a),
    parseWebhookEvents: (...a: unknown[]) => mockParseWebhookEvents(...a),
  }),
}));

// Tenant resolver (credential-free lookup).
const mockResolveExternalTenant = vi.fn();
vi.mock("@/app/_lib/integrations/webhook-tenant", () => ({
  resolveWebhookExternalTenant: (...a: unknown[]) =>
    mockResolveExternalTenant(...a),
}));

// The downstream inbox entry point.
const mockProcessPmsWebhook = vi.fn();
vi.mock("@/app/_lib/integrations/reliability/webhook", () => ({
  processPmsWebhook: (...a: unknown[]) => mockProcessPmsWebhook(...a),
}));

// Force production-like env for rate-limit path (dev mode short-circuits).
const originalNodeEnv = process.env.NODE_ENV;
(process.env as Record<string, string>).NODE_ENV = "production";

// Route import — must be after all mocks above.
const { POST } = await import("./route");

// Restore NODE_ENV so other test files aren't polluted.
(process.env as Record<string, string>).NODE_ENV = originalNodeEnv ?? "test";

// ── Helpers ────────────────────────────────────────────────

function makeRequest(options: {
  provider?: string;
  body?: string | object;
  contentLength?: string | null;
  headers?: Record<string, string>;
  method?: string;
}) {
  const bodyStr =
    options.body === undefined
      ? ""
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  };
  if (options.contentLength !== null) {
    headers["content-length"] =
      options.contentLength ?? String(Buffer.byteLength(bodyStr, "utf8"));
  }
  return {
    request: new Request(
      `https://example.com/api/webhooks/pms/${options.provider ?? "mews"}`,
      {
        method: options.method ?? "POST",
        headers,
        body: options.method === "GET" ? undefined : bodyStr,
      },
    ),
    params: Promise.resolve({ provider: options.provider ?? "mews" }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRatelimitLimit.mockResolvedValue({ success: true });
  mockResolveExternalTenant.mockReturnValue("ent-123");
  mockIntegrationFindFirst.mockResolvedValue({
    tenantId: "t1",
    credentialsEncrypted: Buffer.from([1, 2, 3]),
    credentialsIv: Buffer.from([4, 5, 6]),
    webhookEnabled: true,
  });
  mockVerifyWebhookSignature.mockResolvedValue(true);
  mockParseWebhookEvents.mockReturnValue([
    {
      externalEventId: "evt1",
      externalBookingId: "res1",
      eventType: "Reservation",
    },
  ]);
  mockProcessPmsWebhook.mockResolvedValue({
    eventsReceived: 1,
    eventsDuplicated: 0,
    eventsInboxed: 1,
    eventsProcessed: 1,
    eventsDeferred: 0,
  });
});

// ── Tests ──────────────────────────────────────────────────

describe("POST /api/webhooks/pms/[provider] — validation gates", () => {
  it("returns 404 for an unknown provider", async () => {
    const { request, params } = makeRequest({ provider: "bogus" });
    const res = await POST(request, { params });
    expect(res.status).toBe(404);
    expect(mockResolveExternalTenant).not.toHaveBeenCalled();
  });

  it("returns 413 when Content-Length declares > 1 MB", async () => {
    const { request, params } = makeRequest({
      body: {},
      contentLength: "5000000",
    });
    const res = await POST(request, { params });
    expect(res.status).toBe(413);
  });

  it("returns 400 when body is malformed JSON", async () => {
    const { request, params } = makeRequest({ body: "{not-json" });
    const res = await POST(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when tenant cannot be resolved from payload", async () => {
    mockResolveExternalTenant.mockReturnValueOnce(null);
    const { request, params } = makeRequest({ body: {} });
    const res = await POST(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 200 (not 5xx) when tenant is unknown — PMS should stop retrying", async () => {
    mockIntegrationFindFirst.mockResolvedValueOnce(null);
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(200);
  });

  it("returns 200 when webhook is disabled for the tenant (kill-switch)", async () => {
    mockIntegrationFindFirst.mockResolvedValueOnce({
      tenantId: "t1",
      credentialsEncrypted: Buffer.from([1]),
      credentialsIv: Buffer.from([4]),
      webhookEnabled: false,
    });
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note).toContain("disabled");
    expect(mockProcessPmsWebhook).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited", async () => {
    mockRatelimitLimit.mockResolvedValueOnce({ success: false });
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(429);
    expect(mockVerifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("returns 401 when signature verification fails", async () => {
    mockVerifyWebhookSignature.mockResolvedValueOnce(false);
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    expect(mockProcessPmsWebhook).not.toHaveBeenCalled();
  });

  it("returns 400 when parseWebhookEvents returns null", async () => {
    mockParseWebhookEvents.mockReturnValueOnce(null);
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 200 with eventsReceived=0 when parseWebhookEvents returns empty array", async () => {
    mockParseWebhookEvents.mockReturnValueOnce([]);
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eventsReceived).toBe(0);
    expect(mockProcessPmsWebhook).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/pms/[provider] — happy path", () => {
  it("dispatches to processPmsWebhook with parsed events and returns 200", async () => {
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.eventsInboxed).toBe(1);
    expect(json.eventsProcessed).toBe(1);

    expect(mockProcessPmsWebhook).toHaveBeenCalledOnce();
    const call = mockProcessPmsWebhook.mock.calls[0][0];
    expect(call.tenantId).toBe("t1");
    expect(call.provider).toBe("mews");
    expect(call.events[0].externalBookingId).toBe("res1");
  });

  it("returns 503 when processPmsWebhook throws (DB down, retry expected)", async () => {
    mockProcessPmsWebhook.mockRejectedValueOnce(new Error("DB unreachable"));
    const { request, params } = makeRequest({ body: { EnterpriseId: "ent-123" } });
    const res = await POST(request, { params });
    expect(res.status).toBe(503);
  });

  it("surfaces a Mews URL token from ?token= into x-forwarded-token header", async () => {
    // Need to use a URL with query string
    const request = new Request(
      "https://example.com/api/webhooks/pms/mews?token=my-url-token",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "25",
        },
        body: JSON.stringify({ EnterpriseId: "ent-123" }),
      },
    );
    await POST(request, { params: Promise.resolve({ provider: "mews" }) });

    const verifyCall = mockVerifyWebhookSignature.mock.calls[0];
    expect(verifyCall[1]["x-forwarded-token"]).toBe("my-url-token");
  });
});
