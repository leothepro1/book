/**
 * FakeAdapter — Development PMS Adapter
 *
 * Simulates a fully working PMS with controllable behavior.
 * Used for UI development and edge case testing.
 * Never used in production.
 */

import { z } from "zod";
import type { PmsAdapter } from "../../adapter";
import type {
  NormalizedBooking,
  NormalizedGuest,
  PmsProvider,
  SyncResult,
} from "../../types";

export const FakeScenarioSchema = z.enum(["happy", "empty", "error", "slow", "cancelled"]);
export type FakeScenario = z.infer<typeof FakeScenarioSchema>;

export const FakeCredentialsSchema = z.object({
  scenario: FakeScenarioSchema,
  delayMs: z.coerce.number().default(800),
});
export type FakeCredentials = z.infer<typeof FakeCredentialsSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateBookings(tenantId: string): NormalizedBooking[] {
  const now = new Date();

  const arrival1 = new Date(now);
  arrival1.setDate(arrival1.getDate() + 3);
  const departure1 = new Date(arrival1);
  departure1.setDate(departure1.getDate() + 4);

  const arrival2 = new Date(now);
  arrival2.setDate(arrival2.getDate() - 1);
  const departure2 = new Date(arrival2);
  departure2.setDate(departure2.getDate() + 3);

  const arrival3 = new Date(now);
  arrival3.setMonth(arrival3.getMonth() - 2);
  const departure3 = new Date(arrival3);
  departure3.setDate(departure3.getDate() + 5);

  return [
    {
      externalId: "fake-booking-1",
      tenantId,
      firstName: "Sofia",
      lastName: "Bergström",
      guestName: "Sofia Bergström",
      guestEmail: "sofia.bergstrom@example.com",
      guestPhone: "+46 70 111 22 33",
      arrival: arrival1,
      departure: departure1,
      unit: "Rum 204",
      unitType: null,
      status: "upcoming",
      adults: 2,
      children: 1,
      extras: [],
      rawSource: "fake",
      checkedInAt: null,
      checkedOutAt: null,
      signatureCapturedAt: null,
    },
    {
      externalId: "fake-booking-2",
      tenantId,
      firstName: "Erik",
      lastName: "Johansson",
      guestName: "Erik Johansson",
      guestEmail: "erik.j@example.com",
      guestPhone: "+46 73 444 55 66",
      arrival: arrival2,
      departure: departure2,
      unit: "Svit 12",
      unitType: null,
      status: "active",
      adults: 1,
      children: 0,
      extras: [],
      rawSource: "fake",
      checkedInAt: new Date(arrival2.getTime() + 4 * 60 * 60 * 1000),
      checkedOutAt: null,
      signatureCapturedAt: null,
    },
    {
      externalId: "fake-booking-3",
      tenantId,
      firstName: "Anna",
      lastName: "Lindqvist",
      guestName: "Anna Lindqvist",
      guestEmail: "anna.l@example.com",
      guestPhone: null,
      arrival: arrival3,
      departure: departure3,
      unit: "Stuga 7",
      unitType: null,
      status: "completed",
      adults: 2,
      children: 2,
      extras: [],
      rawSource: "fake",
      checkedInAt: arrival3,
      checkedOutAt: departure3,
      signatureCapturedAt: null,
    },
  ];
}

export class FakeAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "fake";
  private readonly config: FakeCredentials;

  constructor(config: FakeCredentials) {
    this.config = config;
  }

  private async delay(): Promise<void> {
    if (this.config.delayMs > 0) {
      await sleep(this.config.delayMs);
    }
  }

  async getBookings(
    tenantId: string,
    filters?: { guestEmail?: string; status?: NormalizedBooking["status"][] },
  ): Promise<NormalizedBooking[]> {
    await this.delay();

    if (this.config.scenario === "error") {
      throw new Error("Fake PMS: Connection refused");
    }
    if (this.config.scenario === "empty") return [];

    let bookings = generateBookings(tenantId);

    if (this.config.scenario === "cancelled") {
      bookings[2] = { ...bookings[2], status: "cancelled", checkedInAt: null, checkedOutAt: null };
    }

    if (filters?.guestEmail) {
      const email = filters.guestEmail.toLowerCase();
      bookings = bookings.filter((b) => b.guestEmail.toLowerCase() === email);
    }
    if (filters?.status && filters.status.length > 0) {
      bookings = bookings.filter((b) => filters.status!.includes(b.status));
    }

    return bookings;
  }

  async getBooking(
    tenantId: string,
    externalId: string,
  ): Promise<NormalizedBooking | null> {
    const bookings = await this.getBookings(tenantId);
    return bookings.find((b) => b.externalId === externalId) ?? null;
  }

  async getGuest(
    _tenantId: string,
    _externalId: string,
  ): Promise<NormalizedGuest | null> {
    await this.delay();
    return {
      externalId: "fake-guest-1",
      firstName: "Sofia",
      lastName: "Bergström",
      email: "sofia.bergstrom@example.com",
      phone: "+46 70 111 22 33",
      address: {
        street: "Kungsgatan 5",
        postalCode: "111 43",
        city: "Stockholm",
        country: "SE",
      },
    };
  }

  async notifyCheckIn(_tenantId: string, _externalId: string): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      console.log("[FakeAdapter] notifyCheckIn:", _externalId);
    }
  }

  async notifyCheckOut(_tenantId: string, _externalId: string): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      console.log("[FakeAdapter] notifyCheckOut:", _externalId);
    }
  }

  async testConnection(
    credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }> {
    const parsed = FakeCredentialsSchema.safeParse(credentials);
    if (!parsed.success) {
      return { ok: false, error: "Ogiltiga uppgifter" };
    }

    await sleep(parsed.data.delayMs);

    if (parsed.data.scenario === "error") {
      return { ok: false, error: "Anslutningen nekades — kontrollera dina uppgifter" };
    }

    return { ok: true };
  }

  async syncBookings(tenantId: string, _since?: Date): Promise<SyncResult> {
    await this.delay();

    if (this.config.scenario === "error") {
      return {
        created: 0,
        updated: 0,
        cancelled: 0,
        errors: [{ externalId: "BATCH", error: "Connection refused", retriable: true }],
        syncedAt: new Date(),
      };
    }

    if (this.config.scenario === "empty") {
      return { created: 0, updated: 0, cancelled: 0, errors: [], syncedAt: new Date() };
    }

    const bookings = generateBookings(tenantId);
    const cancelled = this.config.scenario === "cancelled" ? 1 : 0;

    return {
      created: bookings.length,
      updated: 0,
      cancelled,
      errors: [],
      syncedAt: new Date(),
    };
  }

  getWebhookBookingId(_payload: unknown): string | null {
    return "fake-booking-1";
  }

  resolveWebhookTenant(_payload: unknown): string | null {
    return "fake-enterprise-id";
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    _headers: Record<string, string>,
    _credentials: Record<string, string>,
  ): Promise<boolean> {
    return true;
  }
}
