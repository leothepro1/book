import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));

const { ManualAdapter } = await import("./manual");

describe("ManualAdapter.cancelBooking", () => {
  it("returns deterministic success (Manual tenants have no external PMS)", async () => {
    const adapter = new ManualAdapter();
    const r = await adapter.cancelBooking("tenant_1", {
      bookingExternalId: "booking_local_1",
      idempotencyKey: "cancellation:cr_1:attempt:1",
      chargeFee: false,
      sendGuestEmail: false,
    });

    expect(r.alreadyCanceled).toBe(false);
    expect(r.canceledAtPms).toBeInstanceOf(Date);
  });

  it("always returns fresh timestamps (never reuses a stale one)", async () => {
    const adapter = new ManualAdapter();
    const before = Date.now();
    const r = await adapter.cancelBooking("tenant_1", {
      bookingExternalId: "booking_local_2",
      idempotencyKey: "cancellation:cr_2:attempt:1",
      chargeFee: false,
      sendGuestEmail: false,
    });
    const after = Date.now();

    expect(r.canceledAtPms.getTime()).toBeGreaterThanOrEqual(before);
    expect(r.canceledAtPms.getTime()).toBeLessThanOrEqual(after);
  });
});
