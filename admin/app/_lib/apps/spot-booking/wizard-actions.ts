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

// ── Fetch AccommodationCategories ───────────────────────────────

export type CategoryOption = {
  id: string;
  title: string;
  accommodationCount: number;
};

export async function getAccommodationCategories(): Promise<
  ActionResult<CategoryOption[]>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantId = await resolveTenantId();
  if (!tenantId) return { ok: false, error: "Inte inloggad" };

  const categories = await prisma.accommodationCategory.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      _count: { select: { items: true } },
    },
  });

  return {
    ok: true,
    data: categories.map((c) => ({
      id: c.id,
      title: c.title,
      accommodationCount: c._count.items,
    })),
  };
}

// ── Create SpotMap ──────────────────────────────────────────────

export type CreateSpotMapInput = {
  accommodationCategoryId: string;
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

  // Verify category belongs to tenant
  const category = await prisma.accommodationCategory.findFirst({
    where: { id: input.accommodationCategoryId, tenantId },
    select: { id: true },
  });
  if (!category) {
    return { ok: false, error: "Boendetypen tillhor inte din organisation" };
  }

  // Validate addonPrice
  if (!Number.isInteger(input.addonPrice) || input.addonPrice <= 0) {
    return { ok: false, error: "Priset maste vara ett positivt heltal i ore" };
  }

  try {
    const spotMap = await prisma.spotMap.upsert({
      where: {
        tenantAppId_accommodationCategoryId: {
          tenantAppId: tenantApp.id,
          accommodationCategoryId: input.accommodationCategoryId,
        },
      },
      create: {
        tenantId,
        tenantAppId: tenantApp.id,
        accommodationCategoryId: input.accommodationCategoryId,
        imageUrl: input.imageUrl,
        imagePublicId: input.imagePublicId,
        addonPrice: input.addonPrice,
        currency: input.currency,
        isActive: false,
      },
      update: {
        imageUrl: input.imageUrl,
        imagePublicId: input.imagePublicId,
        addonPrice: input.addonPrice,
        currency: input.currency,
      },
    });

    log("info", "spot_booking.map_created", {
      tenantId,
      spotMapId: spotMap.id,
      categoryId: input.accommodationCategoryId,
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

  // Note: markers are added in Prompt 2 (map editor).
  // For initial activation we skip the marker check so the wizard
  // can complete. The map editor will be built next.

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
  accommodationCategoryId: string;
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

  // Verify category belongs to tenant
  const category = await prisma.accommodationCategory.findFirst({
    where: { id: input.accommodationCategoryId, tenantId },
    select: { id: true },
  });
  if (!category) {
    return { ok: false, error: "Boendetypen tillhor inte din organisation" };
  }

  // Check no map already exists for this category
  const existing = await prisma.spotMap.findUnique({
    where: {
      tenantAppId_accommodationCategoryId: {
        tenantAppId: tenantApp.id,
        accommodationCategoryId: input.accommodationCategoryId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Det finns redan en karta for denna boendetyp" };
  }

  if (!Number.isInteger(input.addonPrice) || input.addonPrice <= 0) {
    return { ok: false, error: "Priset maste vara ett positivt heltal i ore" };
  }

  try {
    const spotMap = await prisma.spotMap.create({
      data: {
        tenantId,
        tenantAppId: tenantApp.id,
        accommodationCategoryId: input.accommodationCategoryId,
        imageUrl: input.imageUrl,
        imagePublicId: input.imagePublicId,
        addonPrice: input.addonPrice,
        currency: input.currency,
        isActive: true,
      },
    });

    log("info", "spot_booking.map_created", {
      tenantId,
      spotMapId: spotMap.id,
      categoryId: input.accommodationCategoryId,
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
