import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    guestOtpCode: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { createOtp, verifyOtp } = await import("./otp");
const { prisma } = await import("@/app/_lib/db/prisma");
const mockPrisma = prisma as unknown as {
  guestOtpCode: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

// Helper: compute SHA-256 hex hash
async function sha256(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

describe("createOtp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.guestOtpCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.guestOtpCode.create.mockResolvedValue({ id: "otp_1" });
  });

  it("returns a 6-digit numeric string", async () => {
    const code = await createOtp("ga_1");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("stores a hash, not the raw code", async () => {
    const code = await createOtp("ga_1");

    const createCall = mockPrisma.guestOtpCode.create.mock.calls[0][0];
    expect(createCall.data.codeHash).not.toBe(code);
    expect(createCall.data.codeHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it("deletes previous active codes before creating", async () => {
    await createOtp("ga_1");

    expect(mockPrisma.guestOtpCode.deleteMany).toHaveBeenCalledWith({
      where: {
        guestAccountId: "ga_1",
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(mockPrisma.guestOtpCode.deleteMany).toHaveBeenCalledBefore(
      mockPrisma.guestOtpCode.create,
    );
  });

  it("sets expiresAt ~10 minutes in the future", async () => {
    await createOtp("ga_1");

    const createCall = mockPrisma.guestOtpCode.create.mock.calls[0][0];
    const expiresAt = createCall.data.expiresAt as Date;
    const diffMs = expiresAt.getTime() - Date.now();

    // Should be approximately 10 minutes (allow 5s tolerance)
    expect(diffMs).toBeGreaterThan(9 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(10 * 60 * 1000 + 5000);
  });
});

describe("verifyOtp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true for correct code within TTL", async () => {
    const rawCode = "123456";
    const codeHash = await sha256(rawCode);

    mockPrisma.guestOtpCode.findFirst.mockResolvedValue({
      id: "otp_1",
      guestAccountId: "ga_1",
      codeHash,
      failedAttempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      usedAt: null,
    });
    mockPrisma.guestOtpCode.update.mockResolvedValue({});

    const result = await verifyOtp("ga_1", rawCode);
    expect(result).toBe(true);
  });

  it("marks code as used after verification", async () => {
    const rawCode = "654321";
    const codeHash = await sha256(rawCode);

    mockPrisma.guestOtpCode.findFirst.mockResolvedValue({
      id: "otp_2",
      codeHash,
      failedAttempts: 0,
      usedAt: null,
    });
    mockPrisma.guestOtpCode.update.mockResolvedValue({});

    await verifyOtp("ga_1", rawCode);

    expect(mockPrisma.guestOtpCode.update).toHaveBeenCalledWith({
      where: { id: "otp_2" },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("returns false when no active code exists", async () => {
    mockPrisma.guestOtpCode.findFirst.mockResolvedValue(null);

    const result = await verifyOtp("ga_1", "000000");
    expect(result).toBe(false);
    expect(mockPrisma.guestOtpCode.update).not.toHaveBeenCalled();
  });

  it("returns false for expired code", async () => {
    mockPrisma.guestOtpCode.findFirst.mockResolvedValue(null);

    const result = await verifyOtp("ga_1", "123456");
    expect(result).toBe(false);
  });

  it("returns false on second use (single-use)", async () => {
    const rawCode = "111111";
    const codeHash = await sha256(rawCode);

    // First call: code exists and is unused
    mockPrisma.guestOtpCode.findFirst.mockResolvedValueOnce({
      id: "otp_3",
      codeHash,
      failedAttempts: 0,
      usedAt: null,
    });
    mockPrisma.guestOtpCode.update.mockResolvedValue({});

    const first = await verifyOtp("ga_1", rawCode);
    expect(first).toBe(true);

    // Second call: code is now used, findFirst returns null
    mockPrisma.guestOtpCode.findFirst.mockResolvedValueOnce(null);

    const second = await verifyOtp("ga_1", rawCode);
    expect(second).toBe(false);
  });

  // ── Lockout / failed attempts ──────────────────────────────

  it("increments failedAttempts on wrong code", async () => {
    const correctHash = await sha256("123456");

    mockPrisma.guestOtpCode.findFirst.mockResolvedValue({
      id: "otp_4",
      codeHash: correctHash,
      failedAttempts: 0,
      usedAt: null,
    });
    mockPrisma.guestOtpCode.update.mockResolvedValue({});

    const result = await verifyOtp("ga_1", "000000"); // wrong code
    expect(result).toBe(false);
    expect(mockPrisma.guestOtpCode.update).toHaveBeenCalledWith({
      where: { id: "otp_4" },
      data: { failedAttempts: 1 },
    });
  });

  it("5th failed attempt invalidates the code (sets usedAt)", async () => {
    const correctHash = await sha256("123456");

    mockPrisma.guestOtpCode.findFirst.mockResolvedValue({
      id: "otp_5",
      codeHash: correctHash,
      failedAttempts: 4, // next failure is the 5th
      usedAt: null,
    });
    mockPrisma.guestOtpCode.update.mockResolvedValue({});

    const result = await verifyOtp("ga_1", "000000"); // wrong code
    expect(result).toBe(false);
    expect(mockPrisma.guestOtpCode.update).toHaveBeenCalledWith({
      where: { id: "otp_5" },
      data: {
        failedAttempts: 5,
        usedAt: expect.any(Date),
      },
    });
  });

  it("after invalidation, correct code still returns false", async () => {
    const correctHash = await sha256("123456");

    mockPrisma.guestOtpCode.findFirst.mockResolvedValue({
      id: "otp_6",
      codeHash: correctHash,
      failedAttempts: 5, // already locked out
      usedAt: null,
    });

    const result = await verifyOtp("ga_1", "123456"); // correct code but locked
    expect(result).toBe(false);
    expect(mockPrisma.guestOtpCode.update).not.toHaveBeenCalled();
  });

  it("4 failed attempts + correct code on 5th attempt succeeds", async () => {
    const rawCode = "123456";
    const codeHash = await sha256(rawCode);

    mockPrisma.guestOtpCode.findFirst.mockResolvedValue({
      id: "otp_7",
      codeHash,
      failedAttempts: 4, // 4 failures so far, not yet locked
      usedAt: null,
    });
    mockPrisma.guestOtpCode.update.mockResolvedValue({});

    const result = await verifyOtp("ga_1", rawCode); // correct code
    expect(result).toBe(true);
    expect(mockPrisma.guestOtpCode.update).toHaveBeenCalledWith({
      where: { id: "otp_7" },
      data: { usedAt: expect.any(Date) },
    });
  });
});
