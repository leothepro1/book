/**
 * Engine-level integration tests using heavy mocking.
 *
 * Each test sets the adapter + Stripe mocks to simulate one branch
 * (success, transient, permanent, already-canceled, manual-only) and
 * asserts the resulting Prisma writes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ── Prisma mock surface ─────────────────────────────────────────
const cancellationRequestFindFirst = vi.fn();
const cancellationRequestUpdate = vi.fn();
const cancellationRequestUpdateMany = vi.fn();
const bookingFindFirst = vi.fn();
const bookingUpdateMany = vi.fn();
const orderFindFirst = vi.fn();
const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const orderEventCreate = vi.fn();
const tenantFindUnique = vi.fn();
const cancellationEventCreate = vi.fn();
const pendingLockCreate = vi.fn();
const pendingLockDeleteMany = vi.fn();
const pendingLockFindUnique = vi.fn();
const prismaTransaction = vi.fn();
const syncEventCreate = vi.fn();

vi.mock("@/app/_lib/db/prisma", () => ({
  prisma: {
    cancellationRequest: {
      findFirst: (...a: unknown[]) => cancellationRequestFindFirst(...a),
      update: (...a: unknown[]) => cancellationRequestUpdate(...a),
      updateMany: (...a: unknown[]) => cancellationRequestUpdateMany(...a),
    },
    booking: {
      findFirst: (...a: unknown[]) => bookingFindFirst(...a),
      updateMany: (...a: unknown[]) => bookingUpdateMany(...a),
    },
    order: {
      findFirst: (...a: unknown[]) => orderFindFirst(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
    },
    orderEvent: {
      create: (...a: unknown[]) => orderEventCreate(...a),
    },
    tenant: {
      findUnique: (...a: unknown[]) => tenantFindUnique(...a),
    },
    cancellationEvent: {
      create: (...a: unknown[]) => cancellationEventCreate(...a),
    },
    pendingCancellationLock: {
      create: (...a: unknown[]) => pendingLockCreate(...a),
      deleteMany: (...a: unknown[]) => pendingLockDeleteMany(...a),
      findUnique: (...a: unknown[]) => pendingLockFindUnique(...a),
    },
    syncEvent: {
      create: (...a: unknown[]) => syncEventCreate(...a),
    },
    $transaction: (...a: unknown[]) => prismaTransaction(...a),
  },
}));

// ── Other module mocks ──────────────────────────────────────────
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/observability/sentry", () => ({
  setSentryTenantContext: vi.fn(),
}));

const adapterCancelBooking = vi.fn();
vi.mock("@/app/_lib/integrations/resolve", () => ({
  resolveAdapter: vi.fn(async () => ({ cancelBooking: adapterCancelBooking })),
}));

const stripeRefundsCreate = vi.fn();
const stripePaymentIntentsRetrieve = vi.fn();
vi.mock("@/app/_lib/stripe/client", () => ({
  getStripe: vi.fn(() => ({
    refunds: { create: stripeRefundsCreate },
    paymentIntents: { retrieve: stripePaymentIntentsRetrieve },
  })),
}));

vi.mock("@/app/_lib/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test_stub" },
}));

const sendEmailEvent = vi.fn();
vi.mock("@/app/_lib/email/send", () => ({
  sendEmailEvent: (...a: unknown[]) => sendEmailEvent(...a),
}));

// ── Imports after mocks ─────────────────────────────────────────
const { runCancellationSaga } = await import("./engine");
const { TransientPmsError, PermanentPmsError } = await import("./errors");

// ── Helpers ─────────────────────────────────────────────────────
function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "cr_1",
    tenantId: "tenant_1",
    bookingId: "booking_1",
    orderId: "order_1",
    status: "OPEN",
    attempts: 0,
    version: 2,
    refundAmount: 50_000,
    cancellationFeeAmount: 50_000,
    currency: "SEK",
    reasonHandle: "change-of-plans",
    guestNote: null,
    pmsProvider: "mews",
    ...overrides,
  };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking_1",
    externalId: "res_external_1",
    status: "PRE_CHECKIN",
    firstName: "Anna",
    lastName: "Svensson",
    guestEmail: "anna@example.com",
    checkIn: new Date("2026-06-01T15:00:00Z"),
    arrival: new Date("2026-06-01T15:00:00Z"),
    checkOut: new Date("2026-06-03T11:00:00Z"),
    departure: new Date("2026-06-03T11:00:00Z"),
    ...overrides,
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    status: "PAID",
    stripePaymentIntentId: "pi_test_1",
    ...overrides,
  };
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant_1",
    name: "Grand Hotel",
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    defaultLocale: "sv",
    ...overrides,
  };
}

function setupHappyPath(options: { refundAmount?: number } = {}) {
  const refundAmount = options.refundAmount ?? 50_000;
  cancellationRequestFindFirst.mockResolvedValue(
    makeRequest({ refundAmount }),
  );
  bookingFindFirst.mockResolvedValue(makeBooking());
  orderFindFirst.mockResolvedValue(makeOrder());
  tenantFindUnique.mockResolvedValue(makeTenant());
  pendingLockCreate.mockResolvedValue({
    id: "lock_1",
    tenantId: "tenant_1",
    bookingId: "booking_1",
    dedupKey: "dk",
    expiresAt: new Date(Date.now() + 120_000),
  });
  pendingLockDeleteMany.mockResolvedValue({ count: 1 });
  adapterCancelBooking.mockResolvedValue({
    canceledAtPms: new Date("2026-05-01T12:00:00Z"),
    alreadyCanceled: false,
  });
  stripePaymentIntentsRetrieve.mockResolvedValue({ latest_charge: "ch_test_1" });
  stripeRefundsCreate.mockResolvedValue({ id: "re_test_1", amount: refundAmount });
  orderFindUnique.mockResolvedValue({ id: "order_1", status: "PAID" });
  prismaTransaction.mockImplementation(async (fn: unknown) => {
    const txFn = fn as (tx: Record<string, unknown>) => Promise<unknown>;
    return txFn({
      order: {
        findUnique: orderFindUnique,
        update: orderUpdate,
      },
      orderEvent: { create: orderEventCreate },
      booking: { updateMany: bookingUpdateMany },
      cancellationRequest: { update: cancellationRequestUpdate },
      cancellationEvent: { create: cancellationEventCreate },
    });
  });
  sendEmailEvent.mockResolvedValue({ status: "sent" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Pre-flight: skip when not OPEN / not found ────────────────

describe("runCancellationSaga — no-op guards", () => {
  it("returns silently when request not found", async () => {
    cancellationRequestFindFirst.mockResolvedValue(null);
    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_missing",
    });
    expect(adapterCancelBooking).not.toHaveBeenCalled();
    expect(pendingLockCreate).not.toHaveBeenCalled();
  });

  it("returns silently when request is not OPEN", async () => {
    cancellationRequestFindFirst.mockResolvedValue(
      makeRequest({ status: "CLOSED" }),
    );
    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });
    expect(adapterCancelBooking).not.toHaveBeenCalled();
    expect(pendingLockCreate).not.toHaveBeenCalled();
  });
});

// ─── Happy path: PMS + refund + DB + email ─────────────────────

describe("runCancellationSaga — happy path", () => {
  it("PMS cancel → Stripe refund → DB commit → email sent", async () => {
    setupHappyPath();
    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    expect(adapterCancelBooking).toHaveBeenCalledOnce();
    const adapterArgs = adapterCancelBooking.mock.calls[0][1] as {
      bookingExternalId: string;
      chargeFee: boolean;
      sendGuestEmail: boolean;
      idempotencyKey: string;
    };
    expect(adapterArgs.bookingExternalId).toBe("res_external_1");
    expect(adapterArgs.chargeFee).toBe(false);
    expect(adapterArgs.sendGuestEmail).toBe(false);
    expect(adapterArgs.idempotencyKey).toMatch(/^cancellation:cr_1:attempt:/);

    expect(stripePaymentIntentsRetrieve).toHaveBeenCalledOnce();
    expect(stripeRefundsCreate).toHaveBeenCalledOnce();
    const refundArgs = stripeRefundsCreate.mock.calls[0] as [
      { charge: string; amount: number; reason: string },
      { idempotencyKey: string },
    ];
    expect(refundArgs[0].charge).toBe("ch_test_1");
    expect(refundArgs[0].amount).toBe(50_000);
    expect(refundArgs[1].idempotencyKey).toBe("cancellation:cr_1:refund");

    expect(prismaTransaction).toHaveBeenCalledOnce();
    expect(orderUpdate).toHaveBeenCalled();
    expect(bookingUpdateMany).toHaveBeenCalled();
    expect(cancellationRequestUpdate).toHaveBeenCalled();

    expect(sendEmailEvent).toHaveBeenCalledOnce();

    // Emitted events (at least): PMS_ATTEMPTED, PMS_SUCCEEDED,
    // REFUND_INITIATED, REFUND_SUCCEEDED, CLOSED, EMAIL_SENT.
    const emittedTypes = cancellationEventCreate.mock.calls.map(
      (c) => (c[0] as { data: { type: string } }).data.type,
    );
    expect(emittedTypes).toEqual(
      expect.arrayContaining([
        "PMS_CANCEL_ATTEMPTED",
        "PMS_CANCEL_SUCCEEDED",
        "REFUND_INITIATED",
        "REFUND_SUCCEEDED",
        "CLOSED",
        "EMAIL_SENT",
      ]),
    );

    expect(syncEventCreate).toHaveBeenCalled();
  });

  it("zero-refund (100% fee): skips Stripe call and still closes", async () => {
    setupHappyPath({ refundAmount: 0 });
    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    expect(adapterCancelBooking).toHaveBeenCalledOnce();
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
    expect(prismaTransaction).toHaveBeenCalledOnce();

    const emittedTypes = cancellationEventCreate.mock.calls.map(
      (c) => (c[0] as { data: { type: string } }).data.type,
    );
    expect(emittedTypes).toContain("CLOSED");
    expect(emittedTypes).not.toContain("REFUND_INITIATED");
  });

  it("Manual tenant (no externalId): skips PMS call, commits normally", async () => {
    setupHappyPath();
    bookingFindFirst.mockResolvedValue(makeBooking({ externalId: null }));

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    expect(adapterCancelBooking).not.toHaveBeenCalled();
    const emittedTypes = cancellationEventCreate.mock.calls.map(
      (c) => (c[0] as { data: { type: string } }).data.type,
    );
    expect(emittedTypes).toContain("PMS_CANCEL_SUCCEEDED"); // synthetic
    expect(emittedTypes).toContain("CLOSED");
  });
});

// ─── PMS error branches ────────────────────────────────────────

describe("runCancellationSaga — PMS failures", () => {
  it("transient PMS error: schedules retry, leaves status OPEN", async () => {
    setupHappyPath();
    adapterCancelBooking.mockRejectedValue(
      new TransientPmsError("Mews 429"),
    );

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    // nextAttemptAt set via a single update call on failure path.
    const updateCalls = cancellationRequestUpdate.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    expect(updateCalls.some((d) => "nextAttemptAt" in d)).toBe(true);

    // DB commit must NOT have happened — booking stays PRE_CHECKIN.
    expect(bookingUpdateMany).not.toHaveBeenCalled();
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("permanent PMS error: transitions OPEN → DECLINED with reason=OTHER", async () => {
    setupHappyPath();
    adapterCancelBooking.mockRejectedValue(
      new PermanentPmsError("Reservation is Started"),
    );

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    // updateMany used (with status guard) for the DECLINED transition.
    expect(cancellationRequestUpdateMany).toHaveBeenCalled();
    const args = cancellationRequestUpdateMany.mock.calls[0][0] as {
      data: { status: string; declineReason: string };
    };
    expect(args.data.status).toBe("DECLINED");
    expect(args.data.declineReason).toBe("OTHER");

    // DB commit path didn't run; Stripe untouched.
    expect(stripeRefundsCreate).not.toHaveBeenCalled();
    expect(bookingUpdateMany).not.toHaveBeenCalled();
  });

  it("PMS 5th attempt exhausts retry budget → DECLINED", async () => {
    setupHappyPath();
    cancellationRequestFindFirst.mockResolvedValue(
      makeRequest({ attempts: 4 }), // this will be the 5th attempt
    );
    adapterCancelBooking.mockRejectedValue(
      new TransientPmsError("Mews 429 again"),
    );

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    expect(cancellationRequestUpdateMany).toHaveBeenCalled();
    const args = cancellationRequestUpdateMany.mock.calls[0][0] as {
      data: { status: string };
    };
    expect(args.data.status).toBe("DECLINED");
  });
});

// ─── Stripe error branches ─────────────────────────────────────

describe("runCancellationSaga — Stripe failures", () => {
  it("transient Stripe error: schedules retry, keeps OPEN, does NOT reverse PMS", async () => {
    setupHappyPath();
    const stripeErr = Object.assign(new Error("Network blip"), {
      type: "StripeConnectionError",
    });
    stripeRefundsCreate.mockRejectedValue(stripeErr);

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    // Refund was attempted
    expect(stripeRefundsCreate).toHaveBeenCalledOnce();

    // PMS was called — and NOT reversed
    expect(adapterCancelBooking).toHaveBeenCalledOnce();
    expect(adapterCancelBooking).not.toHaveBeenCalledTimes(2);

    // Request stays OPEN with refundStatus=PENDING + nextAttemptAt set
    const updateDatas = cancellationRequestUpdate.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    expect(
      updateDatas.some(
        (d) => d.refundStatus === "PENDING" && "nextAttemptAt" in d,
      ),
    ).toBe(true);

    // No booking / order transitions because the commit step never ran
    expect(bookingUpdateMany).not.toHaveBeenCalled();
  });

  it("permanent Stripe error: refundStatus=FAILED, keeps OPEN, alert via log", async () => {
    setupHappyPath();
    const stripeErr = Object.assign(new Error("Cannot refund"), {
      type: "StripeInvalidRequestError",
    });
    stripeRefundsCreate.mockRejectedValue(stripeErr);

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    const updateDatas = cancellationRequestUpdate.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    expect(
      updateDatas.some(
        (d) => d.refundStatus === "FAILED" && d.nextAttemptAt === null,
      ),
    ).toBe(true);

    // Must not enter the DB commit transaction: booking stays PRE_CHECKIN.
    expect(bookingUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── Re-entry / idempotency ────────────────────────────────────

describe("runCancellationSaga — idempotency / re-entry", () => {
  it("lock contention: defers without running PMS call", async () => {
    cancellationRequestFindFirst.mockResolvedValue(makeRequest());
    bookingFindFirst.mockResolvedValue(makeBooking());
    orderFindFirst.mockResolvedValue(makeOrder());
    tenantFindUnique.mockResolvedValue(makeTenant());

    // Lock acquisition returns null — another run is holding it
    pendingLockCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    // Mark the existing lock as live (not expired)
    pendingLockFindUnique.mockResolvedValue({
      id: "other_lock",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    expect(adapterCancelBooking).not.toHaveBeenCalled();
    // Defers by setting nextAttemptAt (5 min later).
    expect(cancellationRequestUpdateMany).toHaveBeenCalled();
  });

  it("alreadyCanceled=true from adapter proceeds through normal commit", async () => {
    setupHappyPath();
    adapterCancelBooking.mockResolvedValue({
      canceledAtPms: new Date(),
      alreadyCanceled: true,
    });

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    const emittedTypes = cancellationEventCreate.mock.calls.map(
      (c) => (c[0] as { data: { type: string; metadata?: Record<string, unknown> } }).data,
    );
    // PMS step succeeded (via alreadyCanceled path), commit ran.
    expect(emittedTypes.some((e) => e.type === "PMS_CANCEL_SUCCEEDED")).toBe(true);
    expect(emittedTypes.some((e) => e.type === "CLOSED")).toBe(true);
    expect(stripeRefundsCreate).toHaveBeenCalledOnce();
  });
});

// ─── Email best-effort ─────────────────────────────────────────

describe("runCancellationSaga — email is best-effort", () => {
  it("email failure does NOT re-open the request", async () => {
    setupHappyPath();
    sendEmailEvent.mockResolvedValue({
      status: "failed",
      error: new Error("Resend down"),
    });

    await runCancellationSaga({
      tenantId: "tenant_1",
      cancellationRequestId: "cr_1",
    });

    // Commit still happened, CLOSED still emitted.
    const emittedTypes = cancellationEventCreate.mock.calls.map(
      (c) => (c[0] as { data: { type: string } }).data.type,
    );
    expect(emittedTypes).toContain("CLOSED");
    expect(emittedTypes).toContain("EMAIL_FAILED");
  });
});
