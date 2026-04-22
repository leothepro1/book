import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));

const { FakeAdapter } = await import("./index");
const { TransientPmsError, PermanentPmsError } = await import(
  "@/app/_lib/cancellations/errors"
);
type FakeCancelScenario = import("./index").FakeCancelScenario;
type FakeScenario = import("./index").FakeScenario;

const baseParams = {
  bookingExternalId: "res_123",
  idempotencyKey: "cancellation:cr_1:attempt:1",
  chargeFee: false,
  sendGuestEmail: false,
} as const;

function adapter(opts: {
  scenario?: FakeScenario;
  cancelScenario?: FakeCancelScenario;
  delayMs?: number;
} = {}) {
  return new FakeAdapter({
    scenario: opts.scenario ?? "happy",
    delayMs: opts.delayMs ?? 0,
    cancelScenario: opts.cancelScenario,
  });
}

describe("FakeAdapter.cancelBooking — explicit cancelScenario", () => {
  it("'succeed' returns a fresh cancel (alreadyCanceled=false)", async () => {
    const r = await adapter({ cancelScenario: "succeed" }).cancelBooking(
      "tenant_1",
      { ...baseParams },
    );
    expect(r.alreadyCanceled).toBe(false);
    expect(r.canceledAtPms).toBeInstanceOf(Date);
    expect(r.rawAuditPayload?.scenario).toBe("succeed");
  });

  it("'already-canceled' returns alreadyCanceled=true", async () => {
    const r = await adapter({ cancelScenario: "already-canceled" }).cancelBooking(
      "tenant_1",
      { ...baseParams },
    );
    expect(r.alreadyCanceled).toBe(true);
    expect(r.rawAuditPayload?.reason).toBe("already-canceled");
  });

  it("'transient-error' throws TransientPmsError", async () => {
    const a = adapter({ cancelScenario: "transient-error" });
    await expect(a.cancelBooking("tenant_1", { ...baseParams })).rejects.toBeInstanceOf(
      TransientPmsError,
    );
  });

  it("'rate-limited' throws TransientPmsError with retryAfterMs set", async () => {
    const a = adapter({ cancelScenario: "rate-limited" });
    try {
      await a.cancelBooking("tenant_1", { ...baseParams });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TransientPmsError);
      expect((err as InstanceType<typeof TransientPmsError>).retryAfterMs).toBe(
        30_000,
      );
    }
  });

  it("'permanent-error' throws PermanentPmsError", async () => {
    const a = adapter({ cancelScenario: "permanent-error" });
    await expect(a.cancelBooking("tenant_1", { ...baseParams })).rejects.toBeInstanceOf(
      PermanentPmsError,
    );
  });
});

describe("FakeAdapter.cancelBooking — default scenario mapping", () => {
  it("'happy' maps to succeed", async () => {
    const r = await adapter({ scenario: "happy" }).cancelBooking("tenant_1", { ...baseParams });
    expect(r.alreadyCanceled).toBe(false);
  });

  it("'empty' maps to succeed", async () => {
    const r = await adapter({ scenario: "empty" }).cancelBooking("tenant_1", { ...baseParams });
    expect(r.alreadyCanceled).toBe(false);
  });

  it("'slow' maps to succeed", async () => {
    const r = await adapter({ scenario: "slow", delayMs: 0 }).cancelBooking(
      "tenant_1",
      { ...baseParams },
    );
    expect(r.alreadyCanceled).toBe(false);
  });

  it("'cancelled' maps to already-canceled", async () => {
    const r = await adapter({ scenario: "cancelled" }).cancelBooking(
      "tenant_1",
      { ...baseParams },
    );
    expect(r.alreadyCanceled).toBe(true);
  });

  it("'error' maps to permanent-error", async () => {
    const a = adapter({ scenario: "error" });
    await expect(a.cancelBooking("tenant_1", { ...baseParams })).rejects.toBeInstanceOf(
      PermanentPmsError,
    );
  });

  it("explicit cancelScenario overrides scenario-derived default", async () => {
    // scenario=error would default to permanent-error, but cancelScenario wins.
    const r = await adapter({ scenario: "error", cancelScenario: "succeed" }).cancelBooking(
      "tenant_1",
      { ...baseParams },
    );
    expect(r.alreadyCanceled).toBe(false);
  });
});
