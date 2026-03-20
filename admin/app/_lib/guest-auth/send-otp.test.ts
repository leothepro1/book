import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    guestAccount: {
      findUnique: vi.fn(),
    },
    booking: {
      findFirst: vi.fn(),
    },
    tenant: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("./otp", () => ({
  createOtp: vi.fn(),
}));

vi.mock("@/app/_lib/email/send", () => ({
  sendEmailEvent: vi.fn(),
}));

const { sendOtp } = await import("./send-otp");
const { prisma } = await import("@/app/_lib/db/prisma");
const { createOtp } = await import("./otp");
const { sendEmailEvent } = await import("@/app/_lib/email/send");

const mockPrisma = prisma as unknown as {
  guestAccount: { findUnique: ReturnType<typeof vi.fn> };
  booking: { findFirst: ReturnType<typeof vi.fn> };
  tenant: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
};
const mockCreateOtp = createOtp as ReturnType<typeof vi.fn>;
const mockSendEmail = sendEmailEvent as ReturnType<typeof vi.fn>;

describe("sendOtp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.guestAccount.findUnique.mockResolvedValue({
      id: "ga_1",
      tenantId: "t1",
      email: "guest@example.com",
    });
    mockPrisma.booking.findFirst.mockResolvedValue({
      firstName: "Alice",
      lastName: "Smith",
    });
    mockPrisma.tenant.findUniqueOrThrow.mockResolvedValue({
      name: "Grand Hotel",
    });
    mockCreateOtp.mockResolvedValue("123456");
  });

  it("returns { sent: true } when sendEmailEvent returns sent", async () => {
    mockSendEmail.mockResolvedValue({ status: "sent" });

    const result = await sendOtp("t1", "guest@example.com");

    expect(result).toEqual({ sent: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      "t1",
      "GUEST_OTP",
      "guest@example.com",
      expect.objectContaining({
        guestName: "Alice Smith",
        otpCode: "123456",
        hotelName: "Grand Hotel",
        expiresInMinutes: "10",
      }),
    );
  });

  it("returns { sent: false, reason: 'rate_limited' } when rate limited", async () => {
    mockSendEmail.mockResolvedValue({ status: "rate_limited" });

    const result = await sendOtp("t1", "guest@example.com");

    expect(result).toEqual({ sent: false, reason: "rate_limited" });
  });

  it("returns { sent: false, reason: 'unsubscribed' } when unsubscribed", async () => {
    mockSendEmail.mockResolvedValue({ status: "skipped_unsubscribed" });

    const result = await sendOtp("t1", "guest@example.com");

    expect(result).toEqual({ sent: false, reason: "unsubscribed" });
  });

  it("returns { sent: false, reason: 'email_failed' } when send fails", async () => {
    mockSendEmail.mockResolvedValue({ status: "failed", error: new Error("boom") });

    const result = await sendOtp("t1", "guest@example.com");

    expect(result).toEqual({ sent: false, reason: "email_failed" });
  });

  it("returns { sent: false, reason: 'no_account' } when guest account not found", async () => {
    mockPrisma.guestAccount.findUnique.mockResolvedValue(null);

    const result = await sendOtp("t1", "unknown@example.com");

    expect(result).toEqual({ sent: false, reason: "no_account" });
    expect(mockCreateOtp).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("uses email as guestName when no booking exists", async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue({ status: "sent" });

    await sendOtp("t1", "guest@example.com");

    expect(mockSendEmail).toHaveBeenCalledWith(
      "t1",
      "GUEST_OTP",
      "guest@example.com",
      expect.objectContaining({ guestName: "guest@example.com" }),
    );
  });
});
