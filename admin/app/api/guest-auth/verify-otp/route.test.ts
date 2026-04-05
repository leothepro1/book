import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    guestAccount: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/_lib/guest-auth/otp", () => ({
  verifyOtp: vi.fn(),
}));

vi.mock("@/app/_lib/magic-link/session", () => ({
  setGuestSession: vi.fn(),
}));

vi.mock("@/app/_lib/guest-auth/resolve-tenant", () => ({
  resolveGuestTenant: vi.fn(),
}));

const { POST } = await import("./route");
const { prisma } = await import("@/app/_lib/db/prisma");
const { verifyOtp } = await import("@/app/_lib/guest-auth/otp");
const { setGuestSession } = await import("@/app/_lib/magic-link/session");
const { resolveGuestTenant } = await import("@/app/_lib/guest-auth/resolve-tenant");

const mockPrisma = prisma as unknown as {
  guestAccount: { findUnique: ReturnType<typeof vi.fn> };
};
const mockVerifyOtp = verifyOtp as ReturnType<typeof vi.fn>;
const mockSetSession = setGuestSession as ReturnType<typeof vi.fn>;
const mockResolveTenant = resolveGuestTenant as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown, host = "hotel.rutgr.com") {
  return new Request("http://localhost:3000/api/guest-auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", host },
    body: JSON.stringify(body),
  });
}

describe("POST /api/guest-auth/verify-otp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveTenant.mockResolvedValue("t1");
  });

  it("returns 200 + redirectTo /home on correct code", async () => {
    mockPrisma.guestAccount.findUnique.mockResolvedValue({ id: "ga_1" });
    mockVerifyOtp.mockResolvedValue(true);
    mockSetSession.mockResolvedValue(undefined);

    const res = await POST(makeRequest({
      email: "guest@example.com",
      code: "123456",
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, redirectTo: "/account" });
    expect(mockSetSession).toHaveBeenCalledWith({
      tenantId: "t1",
      email: "guest@example.com",
      authenticatedAt: expect.any(Number),
      guestAccountId: "ga_1",
    });
  });

  it("returns 401 + { error: 'invalid_credentials' } on wrong code", async () => {
    mockPrisma.guestAccount.findUnique.mockResolvedValue({ id: "ga_1" });
    mockVerifyOtp.mockResolvedValue(false);

    const res = await POST(makeRequest({
      email: "guest@example.com",
      code: "000000",
    }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "invalid_credentials" });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("returns 401 + { error: 'invalid_credentials' } when account not found (same error)", async () => {
    mockPrisma.guestAccount.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({
      email: "unknown@example.com",
      code: "123456",
    }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "invalid_credentials" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns 401 on expired code (verifyOtp returns false)", async () => {
    mockPrisma.guestAccount.findUnique.mockResolvedValue({ id: "ga_1" });
    mockVerifyOtp.mockResolvedValue(false);

    const res = await POST(makeRequest({
      email: "guest@example.com",
      code: "999999",
    }));

    expect(res.status).toBe(401);
  });

  it("returns 400 when code is not 6 digits", async () => {
    const res = await POST(makeRequest({
      email: "guest@example.com",
      code: "12345",
    }));

    expect(res.status).toBe(400);
    expect(mockPrisma.guestAccount.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when code contains letters", async () => {
    const res = await POST(makeRequest({
      email: "guest@example.com",
      code: "12ab56",
    }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await POST(makeRequest({
      email: "not-email",
      code: "123456",
    }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when tenant cannot be resolved", async () => {
    mockResolveTenant.mockResolvedValue(null);

    const res = await POST(makeRequest({
      email: "guest@example.com",
      code: "123456",
    }, "rutgr.com"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "invalid_request" });
  });
});
