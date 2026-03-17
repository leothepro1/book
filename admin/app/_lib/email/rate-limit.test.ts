import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    emailRateLimit: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const { checkEmailRateLimit, recordEmailSend } = await import("./rate-limit");
const { prisma } = await import("@/app/_lib/db/prisma");
const mockPrisma = prisma as unknown as {
  emailRateLimit: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

describe("checkEmailRateLimit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when count is below limit", async () => {
    mockPrisma.emailRateLimit.count.mockResolvedValue(0);

    const result = await checkEmailRateLimit("t1", "a@b.com", "BOOKING_CONFIRMED");
    expect(result).toBe(true);
  });

  it("returns false when count equals limit", async () => {
    mockPrisma.emailRateLimit.count.mockResolvedValue(1); // limit is 1 for BOOKING_CONFIRMED

    const result = await checkEmailRateLimit("t1", "a@b.com", "BOOKING_CONFIRMED");
    expect(result).toBe(false);
  });

  it("returns false when count exceeds limit", async () => {
    mockPrisma.emailRateLimit.count.mockResolvedValue(5);

    const result = await checkEmailRateLimit("t1", "a@b.com", "BOOKING_CONFIRMED");
    expect(result).toBe(false);
  });

  it("allows higher count for SUPPORT_REPLY (limit 20)", async () => {
    mockPrisma.emailRateLimit.count.mockResolvedValue(19);

    const result = await checkEmailRateLimit("t1", "a@b.com", "SUPPORT_REPLY");
    expect(result).toBe(true);
  });

  it("returns true when rate limit check throws (fail-open)", async () => {
    mockPrisma.emailRateLimit.count.mockRejectedValue(new Error("DB down"));

    const result = await checkEmailRateLimit("t1", "a@b.com", "BOOKING_CONFIRMED");
    expect(result).toBe(true);
  });
});

describe("recordEmailSend", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls prisma.emailRateLimit.create with correct fields", async () => {
    mockPrisma.emailRateLimit.create.mockResolvedValue({ id: "1" });

    await recordEmailSend("t1", "a@b.com", "BOOKING_CONFIRMED");

    expect(mockPrisma.emailRateLimit.create).toHaveBeenCalledWith({
      data: {
        tenantId: "t1",
        email: "a@b.com",
        eventType: "BOOKING_CONFIRMED",
      },
    });
  });

  it("does not throw when create fails", async () => {
    mockPrisma.emailRateLimit.create.mockRejectedValue(new Error("DB down"));

    await expect(
      recordEmailSend("t1", "a@b.com", "BOOKING_CONFIRMED"),
    ).resolves.toBeUndefined();
  });
});
