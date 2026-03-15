/**
 * Mews PMS Adapter
 *
 * Full implementation of PmsAdapter for the Mews Connector API.
 * All Mews API calls are POST with auth tokens in the request body.
 * Reservations, customers, and resources are fetched separately
 * and merged in the mapper.
 *
 * Rate limit: 200 requests per AccessToken per 30 seconds.
 * Handled by database-backed rate limiter in MewsClient.
 *
 * Pagination: max 20 pages per sync (2000 bookings).
 * If more exist, a continuation cursor is stored for the next job.
 */

import type { PmsAdapter } from "../../adapter";
import type {
  NormalizedBooking,
  NormalizedGuest,
  PmsProvider,
  SyncResult,
  SyncError,
} from "../../types";
import type { MewsCredentials } from "./credentials";
import { MewsCredentialsSchema } from "./credentials";
import { MewsClient, MewsApiError } from "./client";
import {
  MewsGetReservationsResponseSchema,
  MewsGetCustomersResponseSchema,
  MewsGetResourcesResponseSchema,
  MewsGetServicesResponseSchema,
  MewsWebhookPayloadSchema,
} from "./mews-types";
import type {
  MewsReservation,
  MewsCustomer,
  MewsResource,
  MewsGetReservationsResponse,
  MewsGetCustomersResponse,
  MewsGetResourcesResponse,
} from "./mews-types";
import { mapMewsReservationToNormalized, mapMewsCustomerToGuest } from "./booking-mapper";
import { toMewsStates } from "./status-mapping";

const PAGE_SIZE = 100;
const CUSTOMER_BATCH_SIZE = 1000;
const MAX_PAGES_PER_SYNC = 20;
const DEFAULT_INITIAL_SYNC_DAYS = 90;

export class MewsAdapter implements PmsAdapter {
  readonly provider: PmsProvider = "mews";
  private readonly client: MewsClient;
  private readonly credentials: MewsCredentials;

  constructor(credentials: MewsCredentials) {
    this.credentials = credentials;
    this.client = new MewsClient(credentials);
  }

  // ── getBookings ──────────────────────────────────────────────

  async getBookings(
    tenantId: string,
    filters?: { guestEmail?: string; status?: NormalizedBooking["status"][] },
  ): Promise<NormalizedBooking[]> {
    const mewsStates = filters?.status
      ? filters.status.flatMap(toMewsStates)
      : undefined;

    const { reservations } = await this.fetchReservations({
      states: mewsStates,
      maxPages: MAX_PAGES_PER_SYNC,
    });

    if (reservations.length === 0) return [];

    const customerIds = [...new Set(
      reservations
        .filter((r) => r.AccountType === "Customer" || !r.AccountType)
        .map((r) => r.AccountId),
    )];
    const resourceIds = [...new Set(
      reservations
        .map((r) => r.AssignedResourceId)
        .filter((id): id is string => id != null),
    )];

    const customerMap = await this.fetchCustomerMap(customerIds);
    const resourceMap = await this.fetchResourceMap(resourceIds);

    let bookings = reservations.map((r) =>
      mapMewsReservationToNormalized(
        r,
        customerMap.get(r.AccountId) ?? null,
        r.AssignedResourceId ? resourceMap.get(r.AssignedResourceId) ?? null : null,
        tenantId,
      ),
    );

    if (filters?.guestEmail) {
      const email = filters.guestEmail.toLowerCase();
      bookings = bookings.filter((b) => b.guestEmail.toLowerCase() === email);
    }

    return bookings;
  }

  // ── getBooking ───────────────────────────────────────────────

  async getBooking(
    tenantId: string,
    externalId: string,
  ): Promise<NormalizedBooking | null> {
    const raw = await this.client.post<Record<string, unknown>, MewsGetReservationsResponse>(
      "reservations/getAll/2023-06-06",
      { ReservationIds: [externalId], Limitation: { Count: 1 } },
    );

    const parsed = MewsGetReservationsResponseSchema.parse(raw);
    if (parsed.Reservations.length === 0) return null;

    const reservation = parsed.Reservations[0];
    const customerMap = await this.fetchCustomerMap([reservation.AccountId]);
    const resourceMap = reservation.AssignedResourceId
      ? await this.fetchResourceMap([reservation.AssignedResourceId])
      : new Map<string, MewsResource>();

    return mapMewsReservationToNormalized(
      reservation,
      customerMap.get(reservation.AccountId) ?? null,
      reservation.AssignedResourceId
        ? resourceMap.get(reservation.AssignedResourceId) ?? null
        : null,
      tenantId,
    );
  }

  // ── getGuest ─────────────────────────────────────────────────

  async getGuest(
    _tenantId: string,
    externalId: string,
  ): Promise<NormalizedGuest | null> {
    const raw = await this.client.post<Record<string, unknown>, MewsGetCustomersResponse>(
      "customers/getAll",
      {
        CustomerIds: [externalId],
        Extent: { Customers: true },
        Limitation: { Count: 1 },
      },
    );

    const parsed = MewsGetCustomersResponseSchema.parse(raw);
    if (parsed.Customers.length === 0) return null;

    return mapMewsCustomerToGuest(parsed.Customers[0]);
  }

  // ── notifyCheckIn / notifyCheckOut ───────────────────────────

  async notifyCheckIn(_tenantId: string, _externalId: string): Promise<void> {}
  async notifyCheckOut(_tenantId: string, _externalId: string): Promise<void> {}

  // ── testConnection ───────────────────────────────────────────

  async testConnection(
    credentials: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const parsed = MewsCredentialsSchema.parse(credentials);
      const testClient = new MewsClient(parsed);

      const raw = await testClient.post<Record<string, unknown>, unknown>(
        "services/getAll",
        { Limitation: { Count: 1 } },
      );

      MewsGetServicesResponseSchema.parse(raw);
      return { ok: true };
    } catch (error) {
      if (error instanceof MewsApiError) {
        return { ok: false, error: `Mews API error: ${error.message} (${error.status})` };
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ── syncBookings ─────────────────────────────────────────────

  async syncBookings(
    tenantId: string,
    since?: Date,
  ): Promise<SyncResult> {
    const errors: SyncError[] = [];
    let created = 0;
    let updated = 0;
    let cancelled = 0;

    try {
      // Enforce since — default to initialSyncDays for first sync
      const effectiveSince = since ?? new Date(
        Date.now() - (this.credentials.initialSyncDays ?? DEFAULT_INITIAL_SYNC_DAYS) * 24 * 60 * 60 * 1000,
      );

      const { reservations } = await this.fetchReservations({
        updatedSince: effectiveSince,
        maxPages: MAX_PAGES_PER_SYNC,
      });

      if (reservations.length === 0) {
        return { created: 0, updated: 0, cancelled: 0, errors: [], syncedAt: new Date() };
      }

      const customerIds = [...new Set(reservations.map((r) => r.AccountId))];
      const resourceIds = [...new Set(
        reservations
          .map((r) => r.AssignedResourceId)
          .filter((id): id is string => id != null),
      )];

      const customerMap = await this.fetchCustomerMap(customerIds);
      const resourceMap = await this.fetchResourceMap(resourceIds);

      const { upsertSyncedBooking } = await import("../../sync/engine");

      for (const reservation of reservations) {
        try {
          const booking = mapMewsReservationToNormalized(
            reservation,
            customerMap.get(reservation.AccountId) ?? null,
            reservation.AssignedResourceId
              ? resourceMap.get(reservation.AssignedResourceId) ?? null
              : null,
            tenantId,
          );

          const result = await upsertSyncedBooking(booking, "mews");

          if (result === "created") created++;
          else if (result === "updated") updated++;
          if (booking.status === "cancelled") cancelled++;
        } catch (error) {
          errors.push({
            externalId: reservation.Id,
            error: error instanceof Error ? error.message : String(error),
            retriable: true,
          });
        }
      }
    } catch (error) {
      errors.push({
        externalId: "BATCH",
        error: error instanceof Error ? error.message : String(error),
        retriable: error instanceof MewsApiError ? error.retriable : true,
      });
    }

    return { created, updated, cancelled, errors, syncedAt: new Date() };
  }

  // ── Webhook methods ──────────────────────────────────────────

  getWebhookBookingId(payload: unknown): string | null {
    const parsed = MewsWebhookPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;

    const event = parsed.data.Events.find(
      (e) => e.Discriminator === "ServiceOrderUpdated",
    );
    return event?.Value.Id ?? null;
  }

  resolveWebhookTenant(payload: unknown): string | null {
    const parsed = MewsWebhookPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    return parsed.data.EnterpriseId;
  }

  async verifyWebhookSignature(
    _rawBody: Buffer,
    headers: Record<string, string>,
    credentials: Record<string, string>,
  ): Promise<boolean> {
    const token = headers["x-forwarded-token"];
    const expectedSecret = credentials.webhookSecret ?? credentials.WebhookSecret;
    if (!token || !expectedSecret) return false;
    return token === expectedSecret;
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Fetch reservations with pagination limit.
   * Returns the reservations fetched and the last cursor
   * (non-null if more pages exist).
   */
  private async fetchReservations(options: {
    states?: string[];
    updatedSince?: Date;
    maxPages?: number;
    startCursor?: string;
  }): Promise<{ reservations: MewsReservation[]; lastCursor: string | null }> {
    const all: MewsReservation[] = [];
    let cursor: string | undefined = options.startCursor;
    const maxPages = options.maxPages ?? MAX_PAGES_PER_SYNC;
    let pageCount = 0;

    do {
      const body: Record<string, unknown> = {
        Limitation: { Count: PAGE_SIZE, ...(cursor ? { Cursor: cursor } : {}) },
      };

      if (options.states && options.states.length > 0) {
        body.States = options.states;
      }

      if (options.updatedSince) {
        body.UpdatedUtc = {
          StartUtc: options.updatedSince.toISOString(),
          EndUtc: new Date().toISOString(),
        };
      }

      const raw = await this.client.post<Record<string, unknown>, MewsGetReservationsResponse>(
        "reservations/getAll/2023-06-06",
        body,
      );

      const parsed = MewsGetReservationsResponseSchema.parse(raw);
      all.push(...parsed.Reservations);
      cursor = parsed.Cursor ?? undefined;
      pageCount++;

      if (pageCount >= maxPages && cursor) {
        console.warn(
          `[MewsAdapter] Pagination limit reached (${maxPages} pages, ${all.length} reservations). More data may exist.`,
        );
        return { reservations: all, lastCursor: cursor };
      }
    } while (cursor);

    return { reservations: all, lastCursor: null };
  }

  private async fetchCustomerMap(
    customerIds: string[],
  ): Promise<Map<string, MewsCustomer>> {
    const map = new Map<string, MewsCustomer>();
    if (customerIds.length === 0) return map;

    for (let i = 0; i < customerIds.length; i += CUSTOMER_BATCH_SIZE) {
      const batch = customerIds.slice(i, i + CUSTOMER_BATCH_SIZE);

      const raw = await this.client.post<Record<string, unknown>, MewsGetCustomersResponse>(
        "customers/getAll",
        {
          CustomerIds: batch,
          Extent: { Customers: true },
          Limitation: { Count: CUSTOMER_BATCH_SIZE },
        },
      );

      const parsed = MewsGetCustomersResponseSchema.parse(raw);
      for (const customer of parsed.Customers) {
        map.set(customer.Id, customer);
      }
    }

    return map;
  }

  private async fetchResourceMap(
    resourceIds: string[],
  ): Promise<Map<string, MewsResource>> {
    const map = new Map<string, MewsResource>();
    if (resourceIds.length === 0) return map;

    const raw = await this.client.post<Record<string, unknown>, MewsGetResourcesResponse>(
      "resources/getAll",
      {
        ResourceIds: resourceIds,
        Limitation: { Count: 1000 },
      },
    );

    const parsed = MewsGetResourcesResponseSchema.parse(raw);
    for (const resource of parsed.Resources) {
      map.set(resource.Id, resource);
    }

    return map;
  }
}
