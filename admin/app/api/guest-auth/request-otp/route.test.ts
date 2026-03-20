import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/guest-auth/send-otp", () => ({
  sendOtp: vi.fn(),
}));

vi.mock("@/app/_lib/guest-auth/resolve-tenant", () => ({
  resolveGuestTenant: vi.fn(),
}));

const { POST } = await import("./route");
const { sendOtp } = await import("@/app/_lib/guest-auth/send-otp");
const { resolveGuestTenant } = await import("@/app/_lib/guest-auth/resolve-tenant");
const mockSendOtp = sendOtp as ReturnType<typeof vi.fn>;
const mockResolveTenant = resolveGuestTenant as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown, host = "hotel.bedfront.com") {
  return new Request("http://localhost:3000/api/guest-auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", host },
    body: JSON.stringify(body),
  });
}

describe("POST /api/guest-auth/request-otp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveTenant.mockResolvedValue("t1");
  });

  it("returns 200 + { sent: true } when OTP sent successfully", async () => {
    mockSendOtp.mockResolvedValue({ sent: true });

    const res = await POST(makeRequest({ email: "guest@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ sent: true });
    expect(mockSendOtp).toHaveBeenCalledWith("t1", "guest@example.com");
  });

  it("returns 200 + { sent: true } when no_account (security: same response)", async () => {
    mockSendOtp.mockResolvedValue({ sent: false, reason: "no_account" });

    const res = await POST(makeRequest({ email: "unknown@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ sent: true });
  });

  it("returns 200 + { sent: true } when email_failed (graceful degrade)", async () => {
    mockSendOtp.mockResolvedValue({ sent: false, reason: "email_failed" });

    const res = await POST(makeRequest({ email: "guest@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ sent: true });
  });

  it("returns 429 + { error: 'rate_limited' } when rate limited", async () => {
    mockSendOtp.mockResolvedValue({ sent: false, reason: "rate_limited" });

    const res = await POST(makeRequest({ email: "guest@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json).toEqual({ error: "rate_limited" });
  });

  it("returns 400 when email is invalid", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "invalid_request" });
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("returns 400 when tenant cannot be resolved", async () => {
    mockResolveTenant.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: "guest@example.com" }, "bedfront.com"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "invalid_request" });
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockResolveTenant.mockResolvedValue("t1");
    const req = new Request("http://localhost:3000/api/guest-auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "hotel.bedfront.com" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
