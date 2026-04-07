"use server";

/**
 * Spot Booking — Wizard server actions.
 *
 * Called by the custom SpotBookingWizard UI.
 * All functions use requireAdmin() + getCurrentTenant().
 * tenantId is NEVER from request body — resolved from auth.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { log } from "@/app/_lib/logger";

// ── Helpers ─────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function resolveTenantId(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  return tenantData?.tenant.id ?? null;
}

// ── Fetch available Accommodations ─────────────────────────────

export type AccommodationOption = {
  id: string;
  name: string;
  categoryTitle: string;
};

export async function getAccommodations(): Promise<
  ActionResult<AccommodationOption[]>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId, status: "ACTIVE", spotMapItem: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      categoryItems: {
        select: { category: { select: { title: true } } },
        take: 1,
      },
    },
  });

  return {
    ok: true,
    data: accommodations.map((a) => ({
      id: a.id,
      name: a.name,
      categoryTitle: a.categoryItems[0]?.category.title ?? "",
    })),
  };
}

// ── Create SpotMap ──────────────────────────────────────────────

export type CreateSpotMapInput = {
  accommodationIds: string[];
  imageUrl: string;
  imagePublicId: string;
  addonPrice: number; // in ore
  currency: string;
};

export async function createSpotMap(
  input: CreateSpotMapInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  // Verify TenantApp exists with PENDING_SETUP
  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "spot-booking" } },
    select: { id: true, status: true },
  });

  if (!tenantApp) {
    return { ok: false, error: "Appen ar inte installerad" };
  }
  if (tenantApp.status !== "PENDING_SETUP") {
    return { ok: false, error: "Appen ar redan konfigurerad" };
  }

  if (input.accommodationIds.length === 0) {
    return { ok: false, error: "Valj minst ett boende" };
  }

  // Verify all accommodations belong to tenant and are unassigned
  const accommodations = await prisma.accommodation.findMany({
    where: { id: { in: input.accommodationIds }, tenantId, status: "ACTIVE" },
    select: { id: true, spotMapItem: { select: { id: true } } },
  });

  if (accommodations.length !== input.accommodationIds.length) {
    return { ok: false, error: "Ett eller flera boenden tillhor inte din organisation" };
  }

  const alreadyAssigned = accommodations.filter((a) => a.spotMapItem);
  if (alreadyAssigned.length > 0) {
    return { ok: false, error: "Ett eller flera boenden tillhor redan en annan karta" };
  }

  // Validate addonPrice
  if (!Number.isInteger(input.addonPrice) || input.addonPrice <= 0) {
    return { ok: false, error: "Priset maste vara ett positivt heltal i ore" };
  }

  try {
    const spotMap = await prisma.$transaction(async (tx) => {
      const map = await tx.spotMap.create({
        data: {
          tenantId,
          tenantAppId: tenantApp.id,
          imageUrl: input.imageUrl,
          imagePublicId: input.imagePublicId,
          addonPrice: input.addonPrice,
          currency: input.currency,
          isActive: false,
        },
      });

      await tx.spotMapAccommodation.createMany({
        data: input.accommodationIds.map((accId, i) => ({
          spotMapId: map.id,
          accommodationId: accId,
          sortOrder: i,
        })),
      });

      return map;
    });

    log("info", "spot_booking.map_created", {
      tenantId,
      spotMapId: spotMap.id,
      accommodationCount: input.accommodationIds.length,
    });

    return { ok: true, data: { id: spotMap.id } };
  } catch (err) {
    log("error", "spot_booking.map_create_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Kunde inte skapa kartan" };
  }
}

// ── Activate SpotMap ────────────────────────────────────────────

export async function activateSpotMap(
  spotMapId: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  // Load SpotMap with tenant isolation
  const spotMap = await prisma.spotMap.findFirst({
    where: { id: spotMapId, tenantId },
    select: {
      id: true,
      tenantAppId: true,
      _count: { select: { markers: true } },
    },
  });

  if (!spotMap) {
    return { ok: false, error: "Kartan hittades inte" };
  }

  // Atomic activation
  const result = await prisma.$transaction(async (tx) => {
    const updatedMap = await tx.spotMap.update({
      where: { id: spotMap.id },
      data: { isActive: true },
    });

    await tx.tenantApp.update({
      where: { id: spotMap.tenantAppId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    });

    await tx.tenantAppEvent.create({
      data: {
        appId: "spot-booking",
        tenantId,
        type: "ACTIVATED",
        message: "Platsbokning aktiverad",
      },
    });

    return updatedMap;
  });

  log("info", "spot_booking.activated", {
    tenantId,
    spotMapId: result.id,
  });

  return { ok: true, data: { id: result.id } };
}

// ── Create Additional SpotMap (post-setup) ─────────────────────

export type CreateAdditionalSpotMapInput = {
  accommodationIds: string[];
  imageUrl: string;
  imagePublicId: string;
  addonPrice: number;
  currency: string;
};

export async function createAdditionalSpotMap(
  input: CreateAdditionalSpotMapInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "spot-booking" } },
    select: { id: true, status: true },
  });

  if (!tenantApp || tenantApp.status !== "ACTIVE") {
    return { ok: false, error: "Appen ar inte aktiv" };
  }

  if (input.accommodationIds.length === 0) {
    return { ok: false, error: "Valj minst ett boende" };
  }

  // Verify all accommodations belong to tenant and are unassigned
  const accommodations = await prisma.accommodation.findMany({
    where: { id: { in: input.accommodationIds }, tenantId, status: "ACTIVE" },
    select: { id: true, spotMapItem: { select: { id: true } } },
  });

  if (accommodations.length !== input.accommodationIds.length) {
    return { ok: false, error: "Ett eller flera boenden tillhor inte din organisation" };
  }

  const alreadyAssigned = accommodations.filter((a) => a.spotMapItem);
  if (alreadyAssigned.length > 0) {
    return { ok: false, error: "Ett eller flera boenden tillhor redan en annan karta" };
  }

  if (!Number.isInteger(input.addonPrice) || input.addonPrice <= 0) {
    return { ok: false, error: "Priset maste vara ett positivt heltal i ore" };
  }

  try {
    const spotMap = await prisma.$transaction(async (tx) => {
      const map = await tx.spotMap.create({
        data: {
          tenantId,
          tenantAppId: tenantApp.id,
          imageUrl: input.imageUrl,
          imagePublicId: input.imagePublicId,
          addonPrice: input.addonPrice,
          currency: input.currency,
          isActive: true,
        },
      });

      await tx.spotMapAccommodation.createMany({
        data: input.accommodationIds.map((accId, i) => ({
          spotMapId: map.id,
          accommodationId: accId,
          sortOrder: i,
        })),
      });

      return map;
    });

    log("info", "spot_booking.map_created", {
      tenantId,
      spotMapId: spotMap.id,
      accommodationCount: input.accommodationIds.length,
    });

    return { ok: true, data: { id: spotMap.id } };
  } catch (err) {
    log("error", "spot_booking.map_create_failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Kunde inte skapa kartan" };
  }
}

// ── Delete SpotMap ─────────────────────────────────────────────

export async function deleteSpotMap(
  mapId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const spotMap = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    select: { id: true },
  });

  if (!spotMap) {
    return { ok: false, error: "Kartan hittades inte" };
  }

  await prisma.spotMap.delete({ where: { id: spotMap.id } });

  log("info", "spot_booking.map_deleted", { tenantId, spotMapId: mapId });

  return { ok: true, data: undefined };
}

// ── Update SpotMap settings ────────────────────────────────────

export type UpdateSpotMapInput = {
  addonPrice?: number;
  currency?: string;
  imageUrl?: string;
  imagePublicId?: string;
  isActive?: boolean;
};

export async function updateSpotMapSettings(
  mapId: string,
  input: UpdateSpotMapInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const spotMap = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    select: { id: true },
  });

  if (!spotMap) {
    return { ok: false, error: "Kartan hittades inte" };
  }

  if (
    input.addonPrice !== undefined &&
    (!Number.isInteger(input.addonPrice) || input.addonPrice <= 0)
  ) {
    return { ok: false, error: "Priset maste vara ett positivt heltal i ore" };
  }

  const updated = await prisma.spotMap.update({
    where: { id: spotMap.id },
    data: {
      ...(input.addonPrice !== undefined && { addonPrice: input.addonPrice }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.imagePublicId !== undefined && {
        imagePublicId: input.imagePublicId,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  log("info", "spot_booking.map_updated", {
    tenantId,
    spotMapId: updated.id,
  });

  return { ok: true, data: { id: updated.id } };
}

// ── Update SpotMap accommodations ─────────────────────────────

export async function updateSpotMapAccommodations(
  mapId: string,
  accommodationIds: string[],
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const spotMap = await prisma.spotMap.findFirst({
    where: { id: mapId, tenantId },
    select: { id: true },
  });

  if (!spotMap) {
    return { ok: false, error: "Kartan hittades inte" };
  }

  if (accommodationIds.length === 0) {
    return { ok: false, error: "Valj minst ett boende" };
  }

  // Verify all accommodations belong to tenant
  const accs = await prisma.accommodation.findMany({
    where: { id: { in: accommodationIds }, tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (accs.length !== accommodationIds.length) {
    return { ok: false, error: "Ett eller flera boenden tillhor inte din organisation" };
  }

  // Check none are assigned to a DIFFERENT map
  const conflicts = await prisma.spotMapAccommodation.findMany({
    where: {
      accommodationId: { in: accommodationIds },
      spotMapId: { not: mapId },
    },
    select: { accommodationId: true },
  });

  if (conflicts.length > 0) {
    return { ok: false, error: "Ett eller flera boenden tillhor redan en annan karta" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.spotMapAccommodation.deleteMany({ where: { spotMapId: mapId } });
    await tx.spotMapAccommodation.createMany({
      data: accommodationIds.map((accId, i) => ({
        spotMapId: mapId,
        accommodationId: accId,
        sortOrder: i,
      })),
    });
  });

  log("info", "spot_booking.map_accommodations_updated", {
    tenantId,
    spotMapId: mapId,
    count: accommodationIds.length,
  });

  return { ok: true, data: undefined };
}
