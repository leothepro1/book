import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing
vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    guestAccount: {
      upsert: vi.fn(),
    },
  },
}));

const { upsertGuestAccount } = await import("./account");
const { prisma } = await import("@/app/_lib/db/prisma");
const mockPrisma = prisma as unknown as {
  guestAccount: {
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe("upsertGuestAccount", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a new account with normalized email", async () => {
    const fakeAccount = { id: "ga_1", tenantId: "t1", email: "alice@example.com" };
    mockPrisma.guestAccount.upsert.mockResolvedValue(fakeAccount);

    const result = await upsertGuestAccount("t1", "  Alice@Example.COM  ");

    expect(mockPrisma.guestAccount.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_email: { tenantId: "t1", email: "alice@example.com" },
      },
      create: { tenantId: "t1", email: "alice@example.com" },
      update: {},
    });
    expect(result).toEqual(fakeAccount);
  });

  it("returns the same account on second call (idempotent)", async () => {
    const fakeAccount = { id: "ga_1", tenantId: "t1", email: "bob@example.com" };
    mockPrisma.guestAccount.upsert.mockResolvedValue(fakeAccount);

    const first = await upsertGuestAccount("t1", "bob@example.com");
    const second = await upsertGuestAccount("t1", "bob@example.com");

    expect(first.id).toBe(second.id);
    expect(mockPrisma.guestAccount.upsert).toHaveBeenCalledTimes(2);
  });

  it("normalizes email to lowercase", async () => {
    const fakeAccount = { id: "ga_2", tenantId: "t1", email: "test@example.com" };
    mockPrisma.guestAccount.upsert.mockResolvedValue(fakeAccount);

    await upsertGuestAccount("t1", "TEST@EXAMPLE.COM");

    expect(mockPrisma.guestAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_email: { tenantId: "t1", email: "test@example.com" },
        },
        create: { tenantId: "t1", email: "test@example.com" },
      }),
    );
  });

  it("different tenants with same email create separate accounts", async () => {
    const accountT1 = { id: "ga_t1", tenantId: "t1", email: "shared@example.com" };
    const accountT2 = { id: "ga_t2", tenantId: "t2", email: "shared@example.com" };

    mockPrisma.guestAccount.upsert
      .mockResolvedValueOnce(accountT1)
      .mockResolvedValueOnce(accountT2);

    const resultT1 = await upsertGuestAccount("t1", "shared@example.com");
    const resultT2 = await upsertGuestAccount("t2", "shared@example.com");

    expect(resultT1.id).not.toBe(resultT2.id);
    expect(resultT1.tenantId).toBe("t1");
    expect(resultT2.tenantId).toBe("t2");

    // Verify each call used the correct tenantId
    expect(mockPrisma.guestAccount.upsert).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        where: { tenantId_email: { tenantId: "t1", email: "shared@example.com" } },
      }),
    );
    expect(mockPrisma.guestAccount.upsert).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        where: { tenantId_email: { tenantId: "t2", email: "shared@example.com" } },
      }),
    );
  });
});
