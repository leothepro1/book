import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenantLocale: {
      findFirst: (...args: unknown[]) => findFirst(...args),
    },
  },
}));

import { getTenantDefaultLocale } from "./locale";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTenantDefaultLocale", () => {
  it("returns the primary locale when one is set", async () => {
    findFirst.mockResolvedValue({ locale: "en" });

    const locale = await getTenantDefaultLocale("tenant_1");

    expect(locale).toBe("en");
    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", primary: true },
      select: { locale: true },
    });
  });

  it("falls back to 'sv' when the tenant has no primary row", async () => {
    // Partial-setup state: TenantLocale rows may exist but none
    // flagged primary yet. M11.1b's internal route uses the same
    // fallback — kept in sync here so a redirect written with
    // this fallback is findable via the middleware lookup.
    findFirst.mockResolvedValue(null);

    const locale = await getTenantDefaultLocale("tenant_1");

    expect(locale).toBe("sv");
  });

  it("uses the provided transaction client when passed", async () => {
    // Concurrent UPDATE TenantLocale SET primary=... inside
    // another transaction could technically race this read. Using
    // the caller's tx keeps the locale snapshot consistent with
    // the subsequent redirect write in the same boundary.
    const txFindFirst = vi.fn().mockResolvedValue({ locale: "nb" });
    const fakeTx = {
      tenantLocale: { findFirst: txFindFirst },
    } as unknown as Parameters<typeof getTenantDefaultLocale>[1];

    const locale = await getTenantDefaultLocale("tenant_1", fakeTx);

    expect(locale).toBe("nb");
    expect(txFindFirst).toHaveBeenCalledTimes(1);
    // Module-level prisma must NOT have been consulted when a tx
    // client is provided.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("is tenant-isolated — each tenantId produces its own lookup", async () => {
    findFirst
      .mockResolvedValueOnce({ locale: "sv" })
      .mockResolvedValueOnce({ locale: "en" });

    const localeA = await getTenantDefaultLocale("tenant_A");
    const localeB = await getTenantDefaultLocale("tenant_B");

    expect(localeA).toBe("sv");
    expect(localeB).toBe("en");

    const calls = findFirst.mock.calls.map(
      (c) => (c[0] as { where: { tenantId: string } }).where.tenantId,
    );
    expect(calls).toEqual(["tenant_A", "tenant_B"]);
  });
});
