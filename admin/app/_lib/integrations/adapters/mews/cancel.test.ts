import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub Prisma + logger — the production MewsClient transitively imports
// the Prisma-backed rate limiter at module load, which we don't need for
// these pure-unit tests of cancel-error classification.
vi.mock("@/app/_lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/app/_lib/logger", () => ({ log: vi.fn() }));
vi.mock("@/app/_lib/http/fetch", () => ({
  resilientFetch: vi.fn(),
}));

const { MewsApiError } = await import("./client");
const { cancelBookingViaMews } = await import("./cancel");
const { TransientPmsError, PermanentPmsError } = await import(
  "@/app/_lib/cancellations/errors"
);
type MewsClient = import("./client").MewsClient;

function makeMockClient(handlers: {
  [endpoint: string]: (body: unknown) => Promise<unknown>;
}): MewsClient {
  return {
    post: vi.fn(async (endpoint: string, body: unknown) => {
      const handler = handlers[endpoint];
      if (!handler) {
        throw new Error(`Unhandled mock endpoint: ${endpoint}`);
      }
      return handler(body);
    }),
  } as unknown as MewsClient;
}

const baseParams = {
  tenantId: "tenant_abc",
  cancellation: {
    bookingExternalId: "res_xyz",
    idempotencyKey: "cancellation:cr_1:attempt:1",
    chargeFee: false,
    sendGuestEmail: false,
    note: "reason=change-of-plans",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelBookingViaMews — success path", () => {
  it("returns alreadyCanceled=false on 200", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => ({ ReservationIds: ["res_xyz"] }),
    });

    const result = await cancelBookingViaMews({ ...baseParams, client });

    expect(result.alreadyCanceled).toBe(false);
    expect(result.canceledAtPms).toBeInstanceOf(Date);
  });

  it("passes chargeFee=false and SendEmail=false by default", async () => {
    const postSpy = vi.fn<(endpoint: string, body: unknown) => Promise<unknown>>(
      async () => ({ ReservationIds: ["res_xyz"] }),
    );
    const client = { post: postSpy } as unknown as MewsClient;

    await cancelBookingViaMews({ ...baseParams, client });

    expect(postSpy).toHaveBeenCalledWith("reservations/cancel", {
      ReservationIds: ["res_xyz"],
      PostCancellationFee: false,
      SendEmail: false,
      Notes: "reason=change-of-plans",
    });
  });

  it("truncates note to 500 chars (Mews Notes field convention)", async () => {
    const longNote = "x".repeat(600);
    const postSpy = vi.fn<(endpoint: string, body: unknown) => Promise<unknown>>(
      async () => ({ ReservationIds: ["res_xyz"] }),
    );
    const client = { post: postSpy } as unknown as MewsClient;

    await cancelBookingViaMews({
      ...baseParams,
      client,
      cancellation: { ...baseParams.cancellation, note: longNote },
    });

    const [, sentBody] = postSpy.mock.calls[0] as [string, { Notes: string }];
    expect(sentBody.Notes).toHaveLength(500);
  });

  it("omits Notes when not provided", async () => {
    const postSpy = vi.fn<(endpoint: string, body: unknown) => Promise<unknown>>(
      async () => ({ ReservationIds: ["res_xyz"] }),
    );
    const client = { post: postSpy } as unknown as MewsClient;

    await cancelBookingViaMews({
      ...baseParams,
      client,
      cancellation: { ...baseParams.cancellation, note: undefined },
    });

    const [, sentBody] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(sentBody).not.toHaveProperty("Notes");
  });
});

describe("cancelBookingViaMews — 403 idempotency disambiguation", () => {
  it("treats 403 + current state Canceled as alreadyCanceled success", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(403, "Reservation not cancellable", "reservations/cancel", false);
      },
      "reservations/getAll/2023-06-06": async () => ({
        Reservations: [
          {
            Id: "res_xyz",
            ServiceId: "svc_1",
            State: "Canceled",
            CreatedUtc: "2026-04-01T10:00:00Z",
            UpdatedUtc: "2026-04-20T10:00:00Z",
            ScheduledStartUtc: "2026-05-01T15:00:00Z",
            ScheduledEndUtc: "2026-05-03T11:00:00Z",
            StartUtc: "2026-05-01T15:00:00Z",
            EndUtc: "2026-05-03T11:00:00Z",
            AccountType: "Customer",
            AccountId: "cust_1",
          },
        ],
      }),
    });

    const result = await cancelBookingViaMews({ ...baseParams, client });

    expect(result.alreadyCanceled).toBe(true);
    expect(result.rawAuditPayload).toMatchObject({ reason: "already-canceled" });
  });

  it("throws PermanentPmsError on 403 + state=Started (checked-in, genuinely non-cancellable)", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(403, "Reservation not cancellable", "reservations/cancel", false);
      },
      "reservations/getAll/2023-06-06": async () => ({
        Reservations: [
          {
            Id: "res_xyz",
            ServiceId: "svc_1",
            State: "Started",
            CreatedUtc: "2026-04-01T10:00:00Z",
            UpdatedUtc: "2026-04-20T10:00:00Z",
            ScheduledStartUtc: "2026-05-01T15:00:00Z",
            ScheduledEndUtc: "2026-05-03T11:00:00Z",
            StartUtc: "2026-05-01T15:00:00Z",
            EndUtc: "2026-05-03T11:00:00Z",
            AccountType: "Customer",
            AccountId: "cust_1",
          },
        ],
      }),
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(PermanentPmsError);
  });

  it("throws PermanentPmsError on 403 + state=Processed (checked out)", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(403, "Reservation not cancellable", "reservations/cancel", false);
      },
      "reservations/getAll/2023-06-06": async () => ({
        Reservations: [
          {
            Id: "res_xyz",
            ServiceId: "svc_1",
            State: "Processed",
            CreatedUtc: "2026-04-01T10:00:00Z",
            UpdatedUtc: "2026-04-20T10:00:00Z",
            ScheduledStartUtc: "2026-05-01T15:00:00Z",
            ScheduledEndUtc: "2026-05-03T11:00:00Z",
            StartUtc: "2026-05-01T15:00:00Z",
            EndUtc: "2026-05-03T11:00:00Z",
            AccountType: "Customer",
            AccountId: "cust_1",
          },
        ],
      }),
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(PermanentPmsError);
  });

  it("throws TransientPmsError when state-disambiguation lookup itself fails", async () => {
    // If we can't tell whether it's already-canceled or not, we must retry —
    // re-cancel is safe (idempotent via this same branch).
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(403, "Reservation not cancellable", "reservations/cancel", false);
      },
      "reservations/getAll/2023-06-06": async () => {
        throw new MewsApiError(500, "internal error", "reservations/getAll/2023-06-06", true);
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(TransientPmsError);
  });
});

describe("cancelBookingViaMews — classifies other Mews errors", () => {
  it("maps 429 (rate-limited) to TransientPmsError", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(429, "Too many requests", "reservations/cancel", true);
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(TransientPmsError);
  });

  it("maps 500 (internal) to TransientPmsError", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(500, "Internal server error", "reservations/cancel", true);
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(TransientPmsError);
  });

  it("maps 408 (timeout) to TransientPmsError", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(408, "Request timeout", "reservations/cancel", true);
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(TransientPmsError);
  });

  it("maps 400 (bad request) to PermanentPmsError", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(400, "Invalid ReservationId", "reservations/cancel", false);
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(PermanentPmsError);
  });

  it("maps 401 (auth) to PermanentPmsError", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new MewsApiError(401, "Unauthorized", "reservations/cancel", false);
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(PermanentPmsError);
  });

  it("maps unknown/non-Mews errors to TransientPmsError (err on retry side)", async () => {
    const client = makeMockClient({
      "reservations/cancel": async () => {
        throw new TypeError("Network request failed");
      },
    });

    await expect(
      cancelBookingViaMews({ ...baseParams, client }),
    ).rejects.toBeInstanceOf(TransientPmsError);
  });
});
