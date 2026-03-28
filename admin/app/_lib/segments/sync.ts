/**
 * Segment Membership Sync — Shopify-grade.
 *
 * syncGuestSegments()  → re-evaluate all segments for one guest
 * syncSegmentMembers() → re-evaluate one segment for all guests
 *
 * Membership uses soft-delete (leftAt) to preserve history.
 * Re-joining creates a NEW row — old row keeps its leftAt timestamp.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { executeSegmentQuery } from "./engine";
import { log } from "@/app/_lib/logger";
import type { Prisma } from "@prisma/client";

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface SyncResult {
  joined: string[]; // guestAccountId[] that joined
  left: string[];   // guestAccountId[] that left
}

/**
 * Re-evaluate ALL segments for a specific guest.
 * Called after order payment, consent change, tag change.
 */
export async function syncGuestSegments(
  guestAccountId: string,
  tenantId: string,
  tx?: PrismaTransactionClient,
): Promise<SyncResult> {
  const result: SyncResult = { joined: [], left: [] };

  // Fetch all active segments for this tenant
  const segments = await prisma.guestSegment.findMany({
    where: { tenantId },
    select: { id: true, name: true, query: true },
  });

  if (segments.length === 0) return result;

  for (const segment of segments) {
    try {
      // Execute segment query to determine if this guest matches
      const matchingIds = await executeSegmentQuery(segment.query, tenantId);
      const isMatch = matchingIds.includes(guestAccountId);

      // Check current active membership
      const activeMembership = await prisma.guestSegmentMembership.findFirst({
        where: {
          segmentId: segment.id,
          guestAccountId,
          leftAt: null,
        },
        select: { id: true },
      });

      if (isMatch && !activeMembership) {
        // JOIN: guest matches segment but has no active membership
        await prisma.$transaction(async (txInner) => {
          const client = tx ?? txInner;

          // Remove stale unique constraint row if leftAt is set
          // The unique constraint is on [segmentId, guestAccountId],
          // so we must delete the old row before creating a new one
          await (client as PrismaTransactionClient).guestSegmentMembership.deleteMany({
            where: { segmentId: segment.id, guestAccountId, leftAt: { not: null } },
          });

          await (client as PrismaTransactionClient).guestSegmentMembership.create({
            data: {
              tenantId,
              segmentId: segment.id,
              guestAccountId,
            },
          });

          const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
          await createGuestAccountEvent({
            guestAccountId,
            tenantId,
            type: "GUEST_JOINED_SEGMENT",
            message: `Gick med i segment: ${segment.name}`,
            metadata: { segmentId: segment.id, segmentName: segment.name, query: segment.query },
          });
        });

        result.joined.push(guestAccountId);
      } else if (!isMatch && activeMembership) {
        // LEAVE: guest no longer matches but has active membership
        await prisma.$transaction(async (txInner) => {
          const client = tx ?? txInner;

          await (client as PrismaTransactionClient).guestSegmentMembership.update({
            where: { id: activeMembership.id },
            data: { leftAt: new Date() },
          });

          const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
          await createGuestAccountEvent({
            guestAccountId,
            tenantId,
            type: "GUEST_LEFT_SEGMENT",
            message: `Lämnade segment: ${segment.name}`,
            metadata: { segmentId: segment.id, segmentName: segment.name, query: segment.query },
          });
        });

        result.left.push(guestAccountId);
      }
      // If isMatch && activeMembership: already in segment — idempotent skip
      // If !isMatch && !activeMembership: not in segment — nothing to do
    } catch (err) {
      log("error", "segment.sync_guest_segment_failed", {
        tenantId,
        guestAccountId,
        segmentId: segment.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Re-evaluate a specific segment for ALL guests in a tenant.
 * Used by cron for date-based segment re-evaluation.
 */
export async function syncSegmentMembers(
  segmentId: string,
  tenantId: string,
): Promise<SyncResult> {
  const result: SyncResult = { joined: [], left: [] };

  const segment = await prisma.guestSegment.findUnique({
    where: { id: segmentId },
    select: { id: true, name: true, query: true, tenantId: true },
  });

  if (!segment || segment.tenantId !== tenantId) return result;

  // Get all guest IDs that currently match the query
  const matchingIds = new Set(await executeSegmentQuery(segment.query, tenantId));

  // Get all currently active memberships for this segment
  const activeMemberships = await prisma.guestSegmentMembership.findMany({
    where: { segmentId, leftAt: null },
    select: { id: true, guestAccountId: true },
  });

  const activeIds = new Set(activeMemberships.map((m) => m.guestAccountId));

  // Find guests who should JOIN (match but not active member)
  const toJoin = [...matchingIds].filter((id) => !activeIds.has(id));

  // Find guests who should LEAVE (active member but no longer match)
  const toLeave = activeMemberships.filter((m) => !matchingIds.has(m.guestAccountId));

  // Process joins
  for (const guestAccountId of toJoin) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.guestSegmentMembership.deleteMany({
          where: { segmentId, guestAccountId, leftAt: { not: null } },
        });

        await tx.guestSegmentMembership.create({
          data: { tenantId, segmentId, guestAccountId },
        });

        const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
        await createGuestAccountEvent({
          guestAccountId,
          tenantId,
          type: "GUEST_JOINED_SEGMENT",
          message: `Gick med i segment: ${segment.name}`,
          metadata: { segmentId: segment.id, segmentName: segment.name, query: segment.query },
        });
      });
      result.joined.push(guestAccountId);
    } catch (err) {
      log("error", "segment.sync_join_failed", {
        tenantId, segmentId, guestAccountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Process leaves
  for (const membership of toLeave) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.guestSegmentMembership.update({
          where: { id: membership.id },
          data: { leftAt: new Date() },
        });

        const { createGuestAccountEvent } = await import("@/app/_lib/guests/events");
        await createGuestAccountEvent({
          guestAccountId: membership.guestAccountId,
          tenantId,
          type: "GUEST_LEFT_SEGMENT",
          message: `Lämnade segment: ${segment.name}`,
          metadata: { segmentId: segment.id, segmentName: segment.name, query: segment.query },
        });
      });
      result.left.push(membership.guestAccountId);
    } catch (err) {
      log("error", "segment.sync_leave_failed", {
        tenantId, segmentId, guestAccountId: membership.guestAccountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
