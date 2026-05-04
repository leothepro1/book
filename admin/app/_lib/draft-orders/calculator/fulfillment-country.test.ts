import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const tenantFindFirst = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    tenant: {
      findFirst: (...a: unknown[]) => tenantFindFirst(...a),
    },
  },
}));

import { resolveFulfillmentCountry } from "./fulfillment-country";

beforeEach(() => {
  tenantFindFirst.mockReset();
});

afterEach(() => {
  tenantFindFirst.mockReset();
});

describe("resolveFulfillmentCountry", () => {
  it("returns Tenant.addressCountry uppercased ('NO' → 'NO')", async () => {
    tenantFindFirst.mockResolvedValue({ addressCountry: "NO" });
    expect(await resolveFulfillmentCountry("t_1")).toBe("NO");
  });

  it("normalizes lower-case Tenant.addressCountry ('se' → 'SE')", async () => {
    tenantFindFirst.mockResolvedValue({ addressCountry: "se" });
    expect(await resolveFulfillmentCountry("t_1")).toBe("SE");
  });

  it("normalizes mixed-case ('Dk' → 'DK')", async () => {
    tenantFindFirst.mockResolvedValue({ addressCountry: "Dk" });
    expect(await resolveFulfillmentCountry("t_1")).toBe("DK");
  });

  it("Tenant.addressCountry null → 'SE' fallback", async () => {
    tenantFindFirst.mockResolvedValue({ addressCountry: null });
    expect(await resolveFulfillmentCountry("t_1")).toBe("SE");
  });

  it("tenant not found → 'SE' fallback (defensive)", async () => {
    tenantFindFirst.mockResolvedValue(null);
    expect(await resolveFulfillmentCountry("t_unknown")).toBe("SE");
  });

  it("tenantId scoping is enforced via the where clause", async () => {
    tenantFindFirst.mockResolvedValue({ addressCountry: "FI" });
    await resolveFulfillmentCountry("t_target");
    expect(tenantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t_target" },
        select: { addressCountry: true },
      }),
    );
  });
});
