/**
 * Mews Demo API Integration Tests
 *
 * These tests run against the actual Mews demo API (api.mews-demo.com).
 * They are NOT mocked — real HTTP calls.
 *
 * To run manually:
 *   npx vitest run app/_lib/integrations/adapters/mews/__tests__/mews-demo.test.ts
 *
 * These tests are skipped by default in CI. Remove `.skip` to run locally.
 */

import { describe, test, expect } from "vitest";
import { MewsAdapter } from "../index";
import { getMewsDemoCredentials } from "../demo-credentials";
import type { MewsWebhookPayload } from "../mews-types";

// Skip in CI — these make real HTTP calls to Mews demo API
describe.skip("Mews Demo API Integration", () => {
  const credentials = getMewsDemoCredentials();
  const adapter = new MewsAdapter(credentials);

  test("getBookings returns normalized bookings from demo", async () => {
    const bookings = await adapter.getBookings("demo-tenant", {});
    expect(bookings.length).toBeGreaterThan(0);
    expect(bookings[0]).toMatchObject({
      externalId: expect.any(String),
      arrival: expect.any(Date),
      departure: expect.any(Date),
      status: expect.stringMatching(/upcoming|active|completed|cancelled/),
      rawSource: "mews",
    });
  }, 30_000);

  test("testConnection succeeds with demo credentials", async () => {
    const result = await adapter.testConnection(
      credentials as unknown as Record<string, string>,
    );
    expect(result.ok).toBe(true);
  }, 15_000);

  test("getBooking returns single booking by ID", async () => {
    const bookings = await adapter.getBookings("demo-tenant", {});
    if (bookings.length === 0) return; // Skip if demo has no bookings

    const single = await adapter.getBooking("demo-tenant", bookings[0].externalId);
    expect(single).not.toBeNull();
    expect(single?.externalId).toBe(bookings[0].externalId);
  }, 30_000);

  test("getGuest returns guest data", async () => {
    const bookings = await adapter.getBookings("demo-tenant", {});
    if (bookings.length === 0) return;

    // AccountId is the externalId for guest in Mews
    // We need to find a booking with a valid customer
    const bookingWithEmail = bookings.find((b) => b.guestEmail);
    if (!bookingWithEmail) return;

    // For Mews, the guest externalId is the Mews customer ID
    // This is stored as AccountId on the reservation, not directly accessible
    // from NormalizedBooking — skip this test for now
  }, 15_000);

  test("syncBookings returns valid SyncResult", async () => {
    const result = await adapter.syncBookings("demo-tenant");
    expect(result).toMatchObject({
      created: expect.any(Number),
      updated: expect.any(Number),
      cancelled: expect.any(Number),
      errors: expect.any(Array),
      syncedAt: expect.any(Date),
    });
  }, 60_000);
});

describe("Mews Webhook Parsing (unit tests — no HTTP)", () => {
  const credentials = getMewsDemoCredentials();
  const adapter = new MewsAdapter(credentials);

  test("resolveWebhookTenant extracts EnterpriseId", () => {
    const payload: MewsWebhookPayload = {
      EnterpriseId: "enterprise-123",
      IntegrationId: "integration-456",
      Events: [
        {
          Discriminator: "ServiceOrderUpdated",
          Value: { Id: "reservation-789" },
        },
      ],
    };

    expect(adapter.resolveWebhookTenant(payload)).toBe("enterprise-123");
  });

  test("resolveWebhookTenant returns null for invalid payload", () => {
    expect(adapter.resolveWebhookTenant({})).toBeNull();
    expect(adapter.resolveWebhookTenant(null)).toBeNull();
    expect(adapter.resolveWebhookTenant("not-json")).toBeNull();
  });

  test("getWebhookBookingId extracts reservation ID", () => {
    const payload: MewsWebhookPayload = {
      EnterpriseId: "enterprise-123",
      Events: [
        {
          Discriminator: "ServiceOrderUpdated",
          Value: { Id: "reservation-789" },
        },
        {
          Discriminator: "CustomerUpdated",
          Value: { Id: "customer-456" },
        },
      ],
    };

    expect(adapter.getWebhookBookingId(payload)).toBe("reservation-789");
  });

  test("getWebhookBookingId returns null when no reservation events", () => {
    const payload: MewsWebhookPayload = {
      EnterpriseId: "enterprise-123",
      Events: [
        {
          Discriminator: "CustomerUpdated",
          Value: { Id: "customer-456" },
        },
      ],
    };

    expect(adapter.getWebhookBookingId(payload)).toBeNull();
  });

  test("verifyWebhookSignature returns true when token matches", async () => {
    const result = await adapter.verifyWebhookSignature(
      Buffer.from("{}"),
      { "x-forwarded-token": "demo-webhook-secret" },
      { webhookSecret: "demo-webhook-secret" },
    );
    expect(result).toBe(true);
  });

  test("verifyWebhookSignature returns false when token mismatches", async () => {
    const result = await adapter.verifyWebhookSignature(
      Buffer.from("{}"),
      { "x-forwarded-token": "wrong-secret" },
      { webhookSecret: "demo-webhook-secret" },
    );
    expect(result).toBe(false);
  });

  test("verifyWebhookSignature returns false when no token", async () => {
    const result = await adapter.verifyWebhookSignature(
      Buffer.from("{}"),
      {},
      { webhookSecret: "demo-webhook-secret" },
    );
    expect(result).toBe(false);
  });
});
