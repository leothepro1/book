"use server";

/**
 * Spot Booking — Draft-to-Publish pipeline.
 *
 * Mirrors the visual editor's draft/publish architecture exactly:
 * - All edits stay in a JSON draft until explicitly published
 * - Publish is an atomic $transaction reconciling draft → relational data
 * - Optimistic locking via SpotMap.version prevents concurrent overwrites
 * - Deep equality comparison for dirty state detection
 *
 * These server actions are the ONLY way to mutate draft/publish state.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

export type DraftMarker = {
  id?: string;
  label: string;
  x: number;
  y: number;
  accommodationId: string;
  accommodationName: string;
  priceOverride?: number | null; // null/undefined = inherit SpotMap.addonPrice
  color?: string | null; // null/undefined = default accent color
};

export type MapDraftConfig = {
  title: string;
  subtitle: string;
  addonPrice: number;
  currency: string;
  imageUrl: string;
  imagePublicId: string;
  accommodationCategoryId: string;
  markers: DraftMarker[];
};

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Helpers ────────────────────────────────────────────────────

async function resolveTenantId(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  return tenantData?.tenant.id ?? null;
}

async function verifyMapOwnership(
  mapId: string,
  tenantId: string,
) {
  return prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    select: { id: true, version: true },
  });
}

// ── Save Draft ─────────────────────────────────────────────────

export async function saveMapDraft(
  mapId: string,
  config: MapDraftConfig,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const map = await verifyMapOwnership(mapId, tenantId);
  if (!map) return { ok: false, error: "Kartan hittades inte" };

  await prisma.spotMap.update({
    where: { id: map.id },
    data: {
      draftConfig: config as unknown as Prisma.JsonObject,
      draftUpdatedAt: new Date(),
    },
  });

  return { ok: true, data: undefined };
}

// ── Publish Draft ──────────────────────────────────────────────

export async function publishMapDraft(
  mapId: string,
  expectedVersion: number,
): Promise<ActionResult<{ version: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  // Load map with current draft and markers
  const map = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    include: {
      markers: { select: { id: true } },
    },
  });

  if (!map) return { ok: false, error: "Kartan hittades inte" };
  if (!map.draftConfig) return { ok: false, error: "Inget utkast att publicera" };

  const draft = map.draftConfig as unknown as MapDraftConfig;

  // Validate all referenced accommodations still exist
  const accIds = draft.markers.map((m) => m.accommodationId);
  if (accIds.length > 0) {
    const existingAccs = await prisma.accommodation.findMany({
      where: { id: { in: accIds }, tenantId },
      select: { id: true },
    });
    const existingIds = new Set(existingAccs.map((a) => a.id));
    const missing = accIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        error: "Nagra boenden har tagits bort sedan utkastet sparades",
      };
    }
  }

  // Identify markers to delete, update, create
  const draftMarkerIds = new Set(
    draft.markers.filter((m) => m.id).map((m) => m.id!),
  );
  const existingMarkerIds = new Set(map.markers.map((m) => m.id));
  const toDelete = [...existingMarkerIds].filter(
    (id) => !draftMarkerIds.has(id),
  );
  const toUpdate = draft.markers.filter(
    (m) => m.id && existingMarkerIds.has(m.id),
  );
  const toCreate = draft.markers.filter((m) => !m.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Optimistic lock — reject if version changed
      const updated = await tx.spotMap.updateMany({
        where: { id: map.id, version: expectedVersion },
        data: {
          title: draft.title,
          subtitle: draft.subtitle,
          addonPrice: draft.addonPrice,
          currency: draft.currency,
          imageUrl: draft.imageUrl,
          imagePublicId: draft.imagePublicId,
          accommodationCategoryId: draft.accommodationCategoryId,
          draftConfig: Prisma.DbNull,
          draftUpdatedAt: null,
          version: expectedVersion + 1,
        },
      });

      if (updated.count === 0) {
        throw new Error("CONCURRENT_PUBLISH");
      }

      // 1. Delete removed markers (frees unique constraints)
      if (toDelete.length > 0) {
        await tx.spotMarker.deleteMany({
          where: { id: { in: toDelete }, spotMapId: map.id },
        });
      }

      // 2. Update existing markers
      for (const m of toUpdate) {
        await tx.spotMarker.update({
          where: { id: m.id! },
          data: {
            label: m.label,
            x: m.x,
            y: m.y,
            accommodation: { connect: { id: m.accommodationId } },
            priceOverride: m.priceOverride ?? null,
            color: m.color ?? null,
          },
        });
      }

      // 3. Create new markers
      if (toCreate.length > 0) {
        await tx.spotMarker.createMany({
          data: toCreate.map((m) => ({
            tenantId,
            spotMapId: map.id,
            label: m.label,
            x: m.x,
            y: m.y,
            accommodationId: m.accommodationId,
            priceOverride: m.priceOverride ?? null,
            color: m.color ?? null,
          })),
        });
      }

      return expectedVersion + 1;
    });

    log("info", "spot_booking.draft_published", {
      tenantId,
      spotMapId: mapId,
      version: result,
      deleted: toDelete.length,
      updated: toUpdate.length,
      created: toCreate.length,
    });

    return { ok: true, data: { version: result } };
  } catch (err) {
    if (err instanceof Error && err.message === "CONCURRENT_PUBLISH") {
      return {
        ok: false,
        error:
          "En annan admin har publicerat andringar. Ladda om sidan och forsok igen.",
      };
    }

    log("error", "spot_booking.publish_failed", {
      tenantId,
      spotMapId: mapId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Kunde inte publicera" };
  }
}

// ── Discard Draft ──────────────────────────────────────────────

export async function discardMapDraft(
  mapId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const map = await verifyMapOwnership(mapId, tenantId);
  if (!map) return { ok: false, error: "Kartan hittades inte" };

  await prisma.spotMap.update({
    where: { id: map.id },
    data: {
      draftConfig: Prisma.DbNull,
      draftUpdatedAt: null,
    },
  });

  log("info", "spot_booking.draft_discarded", { tenantId, spotMapId: mapId });

  return { ok: true, data: undefined };
}
