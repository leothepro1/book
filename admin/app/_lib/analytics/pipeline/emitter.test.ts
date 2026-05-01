/**
 * Emitter unit tests.
 *
 * Covers the boundary checks that don't require a real database:
 *   - transaction-client detection
 *   - AnalyticsTransactionRequiredError messaging
 *   - AnalyticsValidationError carries Zod issues
 *
 * The end-to-end success / idempotency / tenant-isolation paths are
 * covered by scripts/verify-phase1a.ts (real DB, real raw SQL, real
 * outbox rows). That separation keeps the unit suite fast and DB-free
 * while still validating the SQL-using code paths.
 */

import { describe, expect, it, vi } from "vitest";

import {
  AnalyticsEmitError,
  AnalyticsTransactionRequiredError,
  AnalyticsValidationError,
} from "./errors";
import { emitAnalyticsEvent } from "./emitter";

const TENANT = "cverify000000000000000000";
const VALID_BOOKING_PAYLOAD = {
  booking_id: "booking_1",
  accommodation_id: "acc_1",
  guest_id: "email_a3f7b2c1d4e5f6a7",
  check_in_date: "2026-06-01",
  check_out_date: "2026-06-04",
  number_of_nights: 3,
  number_of_guests: 2,
  total_amount: { amount: 12900, currency: "SEK" },
  source_channel: "direct" as const,
  pms_reference: null,
};

describe("emitAnalyticsEvent — boundary checks", () => {
  it("throws AnalyticsTransactionRequiredError when called with null", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitAnalyticsEvent(null as any, {
        tenantId: TENANT,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "system", actor_id: null },
        payload: VALID_BOOKING_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(AnalyticsTransactionRequiredError);
  });

  it("throws AnalyticsTransactionRequiredError when called with undefined", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitAnalyticsEvent(undefined as any, {
        tenantId: TENANT,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "system", actor_id: null },
        payload: VALID_BOOKING_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(AnalyticsTransactionRequiredError);
  });

  it("throws AnalyticsTransactionRequiredError when called with a full PrismaClient (has $transaction)", async () => {
    // The full client exposes $transaction; tx clients do not. Detection
    // hinges on this — passing the full client by mistake must not
    // silently work because the run wouldn't be transactional.
    const fullClientLookalike = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitAnalyticsEvent(fullClientLookalike as any, {
        tenantId: TENANT,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "system", actor_id: null },
        payload: VALID_BOOKING_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(AnalyticsTransactionRequiredError);
  });

  it("throws AnalyticsTransactionRequiredError on an object without $executeRaw", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitAnalyticsEvent({} as any, {
        tenantId: TENANT,
        eventName: "booking_completed",
        schemaVersion: "0.1.0",
        occurredAt: new Date(),
        actor: { actor_type: "system", actor_id: null },
        payload: VALID_BOOKING_PAYLOAD,
      }),
    ).rejects.toBeInstanceOf(AnalyticsTransactionRequiredError);
  });
});

describe("emitAnalyticsEvent — eventId precedence (Phase 3)", () => {
  // Build a mock tx client that captures the SQL inputs and reflects a
  // single inserted row back from the canonical-id SELECT. Lets us
  // assert which event_id the emitter chose without booting a DB.
  function makeMockTx(): {
    tx: {
      $executeRaw: ReturnType<typeof vi.fn>;
      $queryRaw: ReturnType<typeof vi.fn>;
    };
    capturedInsertEventId: () => string | undefined;
  } {
    let capturedEventId: string | undefined;
    const tx = {
      $executeRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        // values[2] is the third interpolated value in the INSERT;
        // matches order: id, tenant_id, event_id, ... — see emitter.ts.
        capturedEventId = values[2] as string;
        return 1;
      }),
      $queryRaw: vi.fn(async () => [{ id: "outbox_row_id_test" }]),
    };
    return {
      tx,
      capturedInsertEventId: () => capturedEventId,
    };
  }

  const VALID_BOOKING_PARAMS = {
    tenantId: TENANT,
    eventName: "booking_completed" as const,
    schemaVersion: "0.1.0",
    occurredAt: new Date("2026-06-01T12:00:00.000Z"),
    actor: { actor_type: "system" as const, actor_id: null },
    payload: VALID_BOOKING_PAYLOAD,
  };

  it("uses an explicit eventId verbatim, ignoring idempotencyKey", async () => {
    const { tx, capturedInsertEventId } = makeMockTx();
    const explicitId = "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZA"; // valid 26-char ULID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await emitAnalyticsEvent(tx as any, {
      ...VALID_BOOKING_PARAMS,
      idempotencyKey: "would-derive-different-id",
      eventId: explicitId,
    });
    expect(result.event_id).toBe(explicitId);
    expect(capturedInsertEventId()).toBe(explicitId);
  });

  it("falls back to idempotencyKey-derived id when eventId is not given", async () => {
    const { tx, capturedInsertEventId } = makeMockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await emitAnalyticsEvent(tx as any, {
      ...VALID_BOOKING_PARAMS,
      idempotencyKey: "deterministic-key-1",
    });
    // Same key + tenant + event_name should always produce the same ULID.
    // We don't assert the exact value (the seed is the impl detail) but we
    // assert that the captured insert id matches the result and that two
    // independent emits produce identical ids.
    expect(capturedInsertEventId()).toBe(result.event_id);

    const second = makeMockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result2 = await emitAnalyticsEvent(second.tx as any, {
      ...VALID_BOOKING_PARAMS,
      idempotencyKey: "deterministic-key-1",
    });
    expect(result2.event_id).toBe(result.event_id);
  });

  it("generates a random ULID when neither eventId nor idempotencyKey is given", async () => {
    const a = makeMockTx();
    const b = makeMockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r1 = await emitAnalyticsEvent(a.tx as any, VALID_BOOKING_PARAMS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = await emitAnalyticsEvent(b.tx as any, VALID_BOOKING_PARAMS);
    // Both look like ULIDs, and they differ.
    expect(r1.event_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(r2.event_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(r1.event_id).not.toBe(r2.event_id);
  });
});

describe("error class hierarchy", () => {
  it("AnalyticsTransactionRequiredError extends AnalyticsEmitError", () => {
    const e = new AnalyticsTransactionRequiredError();
    expect(e).toBeInstanceOf(AnalyticsEmitError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AnalyticsTransactionRequiredError");
  });

  it("AnalyticsValidationError extends AnalyticsEmitError and carries issues", () => {
    const issues = [
      {
        code: "invalid_type" as const,
        path: ["payload", "booking_id"],
        message: "Required",
        expected: "string",
        input: undefined,
      },
    ];
    const e = new AnalyticsValidationError(issues);
    expect(e).toBeInstanceOf(AnalyticsEmitError);
    expect(e.issues).toEqual(issues);
    expect(e.message).toContain("1 issue");
  });

  it("AnalyticsValidationError pluralizes when issues > 1", () => {
    const e = new AnalyticsValidationError([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { code: "x" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { code: "y" } as any,
    ]);
    expect(e.message).toContain("2 issues");
  });
});
