/**
 * Email Marketing Sync Engine — Provider-agnostic.
 *
 * buildEmailContact() is the ONLY place that computes contact data.
 * syncContact() is the ONLY place that calls adapter.upsertContact().
 * Segment membership is read from GuestSegmentMembership (single source of truth).
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { RateLimitError } from "./adapters/mailchimp";
import type { EmailContact, EmailMarketingAdapter, SyncResult } from "./types";
import type { Prisma } from "@prisma/client";

// ── Build Contact ───────────────────────────────────────────────

export async function buildEmailContact(
  tenantId: string,
  guestEmail: string,
  appSettings: Record<string, unknown>,
): Promise<EmailContact> {
  const [bookings, orders, guestAccount] = await Promise.all([
    prisma.booking.findMany({
      where: { tenantId, guestEmail },
      select: { arrival: true, departure: true, status: true, firstName: true, lastName: true, phone: true },
      orderBy: { arrival: "desc" },
    }),
    prisma.order.findMany({
      where: { tenantId, guestEmail, status: { in: ["PAID", "FULFILLED"] } },
      select: { totalAmount: true, currency: true, paidAt: true },
    }),
    prisma.guestAccount.findUnique({
      where: { tenantId_email: { tenantId, email: guestEmail } },
      select: {
        id: true, firstName: true, lastName: true, phone: true, country: true,
        segmentMemberships: {
          where: { leftAt: null },
          select: {
            segment: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const totalBookings = bookings.length;
  const totalSpend = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const lastBooking = bookings[0];
  const firstBooking = bookings[bookings.length - 1];
  const vipThreshold = ((appSettings.vipThreshold as number) ?? 10000) * 100;

  // Segment tags from GuestSegmentMembership (single source of truth)
  const tags: string[] = guestAccount?.segmentMemberships.map(
    (m) => `bedfront-segment-${m.segment.id}`,
  ) ?? [];

  return {
    email: guestEmail,
    firstName: guestAccount?.firstName ?? lastBooking?.firstName ?? undefined,
    lastName: guestAccount?.lastName ?? lastBooking?.lastName ?? undefined,
    phone: guestAccount?.phone ?? lastBooking?.phone ?? undefined,
    language: (guestAccount?.country ?? "SE") === "SE" ? "sv" : "en",
    tags,
    customFields: {},
    subscribed: true,
    guestId: guestAccount?.id,
    totalBookings,
    totalSpend,
    lastBookingDate: lastBooking?.arrival?.toISOString().slice(0, 10),
    firstBookingDate: firstBooking?.arrival?.toISOString().slice(0, 10),
    isVip: totalSpend >= vipThreshold,
  };
}

// ── Sync Contact ────────────────────────────────────────────────

export async function syncContact(
  tenantId: string,
  appId: string,
  adapter: EmailMarketingAdapter,
  email: string,
  apiKey: string,
  listId: string,
  appSettings: Record<string, unknown>,
): Promise<void> {
  const contact = await buildEmailContact(tenantId, email, appSettings);

  await adapter.upsertContact(apiKey, listId, contact);

  // Sync segment tags to external provider
  const currentTags = contact.tags;
  if (currentTags.length > 0) await adapter.addTags(apiKey, listId, email, currentTags);

  // Upsert sync record
  await prisma.emailMarketingSync.upsert({
    where: { tenantId_appId_email: { tenantId, appId, email } },
    create: { tenantId, appId, email, status: "SYNCED", contactData: contact as unknown as Prisma.InputJsonValue },
    update: { status: "SYNCED", lastSyncedAt: new Date(), contactData: contact as unknown as Prisma.InputJsonValue, errorMessage: null },
  });
}

// ── Sync All Contacts ───────────────────────────────────────────

export async function syncAllContacts(
  tenantId: string,
  appId: string,
  adapter: EmailMarketingAdapter,
  apiKey: string,
  listId: string,
  appSettings: Record<string, unknown>,
): Promise<SyncResult> {
  // Collect unique emails from bookings + orders
  const [bookingEmails, orderEmails] = await Promise.all([
    prisma.booking.findMany({
      where: { tenantId },
      select: { guestEmail: true },
      distinct: ["guestEmail"],
    }),
    prisma.order.findMany({
      where: { tenantId, guestEmail: { not: "" } },
      select: { guestEmail: true },
      distinct: ["guestEmail"],
    }),
  ]);

  const uniqueEmails = [...new Set([
    ...bookingEmails.map((b) => b.guestEmail),
    ...orderEmails.map((o) => o.guestEmail),
  ])].filter((e) => e && e.includes("@"));

  const result: SyncResult = { synced: 0, failed: 0, skipped: 0, errors: [] };

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < uniqueEmails.length; i += batchSize) {
    const batch = uniqueEmails.slice(i, i + batchSize);

    for (const email of batch) {
      try {
        await syncContact(tenantId, appId, adapter, email, apiKey, listId, appSettings);
        result.synced++;
      } catch (err) {
        // Rate limit — pause and retry once
        if (err instanceof RateLimitError) {
          log("warn", "email-marketing.rate_limited", { tenantId, appId, retryAfter: err.retryAfterSeconds });
          await new Promise((r) => setTimeout(r, err.retryAfterSeconds * 1000));
          try {
            await syncContact(tenantId, appId, adapter, email, apiKey, listId, appSettings);
            result.synced++;
            continue;
          } catch (retryErr) {
            result.failed++;
            result.errors.push({ email, error: retryErr instanceof Error ? retryErr.message : String(retryErr) });
          }
        } else {
          result.failed++;
          result.errors.push({ email, error: err instanceof Error ? err.message : String(err) });
        }

        await prisma.emailMarketingSync.upsert({
          where: { tenantId_appId_email: { tenantId, appId, email } },
          create: { tenantId, appId, email, status: "FAILED", errorMessage: String(err).slice(0, 500), contactData: {} },
          update: { status: "FAILED", errorMessage: String(err).slice(0, 500) },
        });

        log("warn", "email-marketing.sync_contact_failed", { tenantId, appId, email, error: String(err).slice(0, 200) });
      }
    }
  }

  log("info", "email-marketing.sync_all_completed", {
    tenantId, appId, synced: result.synced, failed: result.failed, total: uniqueEmails.length,
  });

  return result;
}
