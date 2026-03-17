import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateToken, getExpiryDate } from "./tokens";

// ── generateToken ───────────────────────────────────────────────

describe("generateToken", () => {
  it("returns a string", () => {
    expect(typeof generateToken()).toBe("string");
  });

  it("returns consistent length (base64url of 32 bytes = 43 chars)", () => {
    const token = generateToken();
    expect(token.length).toBe(43);
  });

  it("two calls never return the same token", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });

  it("contains only URL-safe characters", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ── getExpiryDate ───────────────────────────────────────────────

describe("getExpiryDate", () => {
  it("returns a Date in the future", () => {
    const expiry = getExpiryDate();
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it("is approximately 24 hours from now (within 1 minute tolerance)", () => {
    const before = Date.now();
    const expiry = getExpiryDate();
    const after = Date.now();

    const expected24h = 24 * 60 * 60 * 1000;
    const tolerance = 60 * 1000; // 1 minute

    expect(expiry.getTime() - before).toBeGreaterThan(expected24h - tolerance);
    expect(expiry.getTime() - after).toBeLessThan(expected24h + tolerance);
  });
});

// ── validateMagicLink ───────────────────────────────────────────

// Mock Prisma before importing the module that uses it
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    magicLinkToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("validateMagicLink", () => {
  let validateMagicLink: typeof import("./validate").validateMagicLink;
  let mockPrisma: {
    magicLinkToken: {
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    vi.resetModules();
    const prismaModule = await import("@/app/_lib/db/prisma");
    mockPrisma = prismaModule.prisma as unknown as typeof mockPrisma;
    const mod = await import("./validate");
    validateMagicLink = mod.validateMagicLink;
  });

  it("returns not_found for unknown token", async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue(null);

    const result = await validateMagicLink("unknown-token");
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns expired for past expiresAt", async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      id: "1",
      tenantId: "t1",
      email: "test@example.com",
      token: "tok",
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
      usedAt: null,
      createdAt: new Date(),
    });

    const result = await validateMagicLink("tok");
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("returns used for token with usedAt set", async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      id: "1",
      tenantId: "t1",
      email: "test@example.com",
      token: "tok",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      createdAt: new Date(),
    });

    const result = await validateMagicLink("tok");
    expect(result).toEqual({ valid: false, reason: "used" });
  });

  it("returns valid: true for valid token and marks it used", async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      id: "1",
      tenantId: "t1",
      email: "test@example.com",
      token: "tok",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
    });
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await validateMagicLink("tok");
    expect(result).toEqual({
      valid: true,
      tenantId: "t1",
      email: "test@example.com",
    });

    // Verify token was marked used
    expect(mockPrisma.magicLinkToken.updateMany).toHaveBeenCalledWith({
      where: { id: "1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("returns used when concurrent request consumed the token", async () => {
    mockPrisma.magicLinkToken.findUnique.mockResolvedValue({
      id: "1",
      tenantId: "t1",
      email: "test@example.com",
      token: "tok",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
    });
    // Simulate concurrent consumption — updateMany returns 0 rows
    mockPrisma.magicLinkToken.updateMany.mockResolvedValue({ count: 0 });

    const result = await validateMagicLink("tok");
    expect(result).toEqual({ valid: false, reason: "used" });
  });
});
