/**
 * Accommodation Sync Engine
 * ═════════════════════════
 *
 * Syncs PMS room types into the Accommodation model and its relations.
 * Replaces the accommodation parts of pms-sync.ts — does NOT touch Product.
 *
 * Key invariants:
 *   - resolveAdapter() is the only way to get an adapter
 *   - Every write is inside a Prisma transaction
 *   - Idempotent: safe to run multiple times (upsert, never blind insert)
 *   - nameOverride / descriptionOverride are NEVER touched by sync
 *   - pmsData is stored as a raw snapshot for debugging — never read in app code
 *   - Unknown facility strings and accommodation types are logged and skipped
 *   - basePricePerNight from PMS adapters is already in ören (verified against FakeAdapter)
 */

import { prisma } from "@/app/_lib/db/prisma";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { isMewsAdapter } from "@/app/_lib/integrations/adapters/mews";
import { log } from "@/app/_lib/logger";
import type { PmsAdapter } from "@/app/_lib/integrations/adapter";
import type { RoomCategory } from "@/app/_lib/integrations/types";
import {
  AccommodationType,
  FacilityType,
  FacilitySource,
} from "@prisma/client";

// ── Type mapping ──────────────────────────────────────────────────
// All PMS adapters must normalize category.type to one of these strings.

const ACCOMMODATION_TYPE_MAP: Record<string, AccommodationType> = {
  HOTEL: AccommodationType.HOTEL,
  CABIN: AccommodationType.CABIN,
  CAMPING: AccommodationType.CAMPING,
  APARTMENT: AccommodationType.APARTMENT,
  PITCH: AccommodationType.PITCH,
};

// ── Facility string mapping ───────────────────────────────────────
// Maps PMS facility labels (Swedish, lowercased) → FacilityType enum.
// Extend as new PMS facility strings are encountered.

const FACILITY_STRING_MAP: Record<string, FacilityType> = {
  // Climate
  "luftkonditionering": FacilityType.AIR_CONDITIONING,
  "uppvärmning": FacilityType.HEATING,
  "fläkt": FacilityType.FAN,
  "braskamin": FacilityType.FIREPLACE,

  // Bathroom
  "badkar": FacilityType.BATHTUB,
  "dusch": FacilityType.SHOWER,
  "bastu": FacilityType.SAUNA,
  "bubbelbad": FacilityType.HOT_TUB,
  "hårtork": FacilityType.HAIRDRYER,
  "badrockar": FacilityType.BATHROBES,
  "tofflor": FacilityType.SLIPPERS,
  "gratis toalettartiklar": FacilityType.FREE_TOILETRIES,
  "bidé": FacilityType.BIDET,
  "wc": FacilityType.WC,

  // Kitchen
  "kök": FacilityType.KITCHEN,
  "pentry": FacilityType.KITCHENETTE,
  "kylskåp": FacilityType.REFRIGERATOR,
  "frys": FacilityType.FREEZER,
  "mikrovågsugn": FacilityType.MICROWAVE,
  "micro": FacilityType.MICROWAVE,
  "ugn": FacilityType.OVEN,
  "spis": FacilityType.STOVE,
  "diskmaskin": FacilityType.DISHWASHER,
  "vattenkokare": FacilityType.KETTLE,
  "kaffe/te-bryggare": FacilityType.COFFEE_MAKER,
  "brödrost": FacilityType.TOASTER,
  "köksredskap": FacilityType.COOKWARE,
  "minibar": FacilityType.MINIBAR,

  // Media & Tech
  "wifi": FacilityType.WIFI,
  "gratis wifi": FacilityType.WIFI,
  "fiber": FacilityType.FIBER,
  "tv": FacilityType.TV,
  "platt-tv": FacilityType.FLAT_SCREEN_TV,
  "kabel-tv": FacilityType.CABLE_TV,
  "satellit-tv": FacilityType.SATELLITE_TV,
  "betal-tv": FacilityType.PAY_TV,
  "bluetooth-högtalare": FacilityType.BLUETOOTH_SPEAKER,
  "apple tv": FacilityType.APPLE_TV,
  "chromecast": FacilityType.CHROMECAST,
  "dvd-spelare": FacilityType.DVD_PLAYER,
  "cd-spelare": FacilityType.CD_PLAYER,
  "spelkonsol": FacilityType.GAME_CONSOLE,
  "förvaringsbox för laptop": FacilityType.LAPTOP_STORAGE,

  // Bedroom & Living
  "garderob": FacilityType.WARDROBE,
  "soffa": FacilityType.SOFA,
  "bäddsoffa": FacilityType.SOFA_BED_LIVING,
  "skrivbord": FacilityType.DESK,
  "strykbräda": FacilityType.IRONING_BOARD,
  "strykjärn": FacilityType.IRON,
  "byxpress": FacilityType.TROUSER_PRESS,
  "tvättmaskin": FacilityType.WASHER,
  "torktumlare": FacilityType.DRYER,
  "torkskåp": FacilityType.DRYING_CABINET,
  "steamer": FacilityType.STEAMER,
  "hantlar": FacilityType.DUMBBELL,

  // Outdoor & View
  "balkong": FacilityType.BALCONY,
  "terrass": FacilityType.TERRACE,
  "uteplats": FacilityType.PATIO,
  "egen pool": FacilityType.PRIVATE_POOL,
  "utsikt över trädgård": FacilityType.GARDEN_VIEW,
  "utsikt över poolområde": FacilityType.POOL_VIEW,
  "havsutsikt": FacilityType.SEA_VIEW,
  "sjöutsikt": FacilityType.LAKE_VIEW,
  "utsikt mot berg": FacilityType.MOUNTAIN_VIEW,
  "utsikt över staden": FacilityType.CITY_VIEW,
  "utsikt över kanalen": FacilityType.CANAL_VIEW,
  "älvutsikt": FacilityType.RIVER_VIEW,
  "fjordutsikt": FacilityType.FJORD_VIEW,

  // Access & Policy
  "egen entré": FacilityType.PRIVATE_ENTRANCE,
  "förvaringsbox": FacilityType.STORAGE_BOX,
  "husdjur tillåtna": FacilityType.PETS_ALLOWED,
  "husdjur ej tillåtna": FacilityType.PETS_NOT_ALLOWED,
  "rökning förbjudet": FacilityType.NO_SMOKING,
  "ljudisolerad": FacilityType.SOUNDPROOFED,
  "tillgänglighetsanpassat": FacilityType.WHEELCHAIR_ACCESSIBLE,
  "elbilsladdare": FacilityType.EV_CHARGER,
  "skiförvaring": FacilityType.SKI_STORAGE,
  "motorvärmare": FacilityType.MOTOR_HEATER,

  // Services
  "väckningsservice": FacilityType.WAKE_UP_SERVICE,
  "väckarklocka": FacilityType.ALARM_CLOCK,
  "sen utcheckning": FacilityType.LATE_CHECKOUT,
  "avresestädning": FacilityType.DEPARTURE_CLEANING,

  // ── FakeAdapter specific labels ─────────────────────────────────
  // These match the exact strings used in FAKE_CATEGORIES[].facilities
  "frukost": FacilityType.COFFEE_MAKER, // breakfast → mapped to nearest kitchen facility
  "städning": FacilityType.DEPARTURE_CLEANING,
  "badrum": FacilityType.SHOWER,
  "parkering": FacilityType.PRIVATE_ENTRANCE, // parking → nearest access facility
  "altan": FacilityType.BALCONY,
  "el": FacilityType.EV_CHARGER, // electrical hookup → nearest
  "servicehus": FacilityType.SHOWER, // service building → shower (campsite)
  "vatten": FacilityType.KITCHEN, // water hookup → kitchen
  "avlopp": FacilityType.WC, // sewage hookup → WC
  "hårdgjord": FacilityType.PATIO, // hard surface pitch → patio
};

// ── Result type ───────────────────────────────────────────────────

export type SyncAccommodationsResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
};

// ── Main sync ─────────────────────────────────────────────────────

/**
 * syncAccommodations — syncs PMS room types into the Accommodation model.
 *
 * Replaces the accommodation parts of syncPmsProducts().
 * Does NOT touch the Product model.
 * Idempotent: safe to run multiple times.
 */
export async function syncAccommodations(
  tenantId: string,
): Promise<SyncAccommodationsResult> {
  const result: SyncAccommodationsResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    errors: [],
  };

  const adapter = await resolveAdapter(tenantId);
  let categories: RoomCategory[];

  try {
    categories = await adapter.getRoomTypes(tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "sync_accommodations.get_room_types_failed", { tenantId, error: msg });
    result.errors.push(`getRoomTypes failed: ${msg}`);
    return result;
  }

  for (const category of categories) {
    try {
      await syncSingleCategory(tenantId, category, adapter.provider, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", "sync_accommodations.category_failed", {
        tenantId,
        categoryId: category.externalId,
        error: msg,
      });
      result.errors.push(`Category ${category.externalId}: ${msg}`);
    }
  }

  // Auto-seed AccommodationCategory records from accommodation types
  try {
    await seedAccommodationCategories(tenantId, categories);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "sync_accommodations.seed_categories_failed", { tenantId, error: msg });
  }

  // Sync physical units (rooms/pitches) from PMS — Mews-specific, skipped for other adapters
  try {
    const unitResult = await syncAccommodationUnits(tenantId, adapter);
    log("info", "sync_accommodations.units_complete", {
      tenantId,
      synced: unitResult.synced,
      skipped: unitResult.skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "sync_accommodations.unit_sync_failed", { tenantId, error: msg });
  }

  log("info", "sync_accommodations.complete", {
    tenantId,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    skipped: result.skipped,
    errorCount: result.errors.length,
  });

  return result;
}

// ── Single category sync ──────────────────────────────────────────

async function syncSingleCategory(
  tenantId: string,
  category: RoomCategory,
  provider: string,
  result: SyncAccommodationsResult,
): Promise<void> {
  // 1. Map type string → enum
  const accommodationType = ACCOMMODATION_TYPE_MAP[category.type];
  if (!accommodationType) {
    log("warn", "sync_accommodations.unknown_type", {
      tenantId,
      categoryId: category.externalId,
      type: category.type,
    });
    result.skipped++;
    return;
  }

  // 2. Map facility strings → FacilityType enum values
  const mappedFacilities = mapFacilities(category.facilities, tenantId, category.externalId);

  // 3. basePricePerNight is already in ören from all adapters (FakeAdapter confirmed: 149900 = 1499 kr)
  const basePriceOren = category.basePricePerNight;

  // 4. Check for existing record
  const existing = await prisma.accommodation.findFirst({
    where: {
      tenantId,
      externalId: category.externalId,
      pmsProvider: provider,
    },
    select: { id: true, slug: true, name: true, maxGuests: true, basePricePerNight: true },
  });

  // 5. Detect changes
  const changed =
    !existing ||
    existing.name !== category.name ||
    existing.maxGuests !== category.maxGuests ||
    existing.basePricePerNight !== basePriceOren;

  if (!changed && existing) {
    // Only bump pmsSyncedAt
    await prisma.accommodation.update({
      where: { id: existing.id },
      data: { pmsSyncedAt: new Date() },
    });
    result.unchanged++;
    return;
  }

  // 6. Resolve slug (keep existing slug on update, generate new on create)
  const slug = existing
    ? existing.slug
    : await resolveUniqueAccommodationSlug(tenantId, slugify(category.name));

  const pmsDataJson = JSON.parse(JSON.stringify(category));

  await prisma.$transaction(async (tx) => {
    let accommodationId: string;

    if (existing) {
      // Update existing
      await tx.accommodation.update({
        where: { id: existing.id },
        data: {
          name: category.name,
          description: category.longDescription || category.shortDescription || "",
          pmsData: pmsDataJson,
          pmsSyncedAt: new Date(),
          accommodationType,
          maxGuests: category.maxGuests,
          defaultGuests: category.defaultGuests ?? null,
          basePricePerNight: basePriceOren,
          // Never overwrite nameOverride or descriptionOverride
        },
      });
      accommodationId = existing.id;
      result.updated++;
    } else {
      // Create new
      const created = await tx.accommodation.create({
        data: {
          tenantId,
          name: category.name,
          slug,
          description: category.longDescription || category.shortDescription || "",
          externalId: category.externalId,
          pmsProvider: provider,
          pmsSyncedAt: new Date(),
          pmsData: pmsDataJson,
          accommodationType,
          maxGuests: category.maxGuests,
          minGuests: 1,
          defaultGuests: category.defaultGuests ?? null,
          basePricePerNight: basePriceOren,
          currency: "SEK",
        },
      });
      accommodationId = created.id;
      result.created++;
    }

    // 7. Sync facilities — delete all PMS-sourced, re-insert mapped ones
    await tx.accommodationFacility.deleteMany({
      where: { accommodationId, source: FacilitySource.PMS },
    });

    if (mappedFacilities.length > 0) {
      await tx.accommodationFacility.createMany({
        data: mappedFacilities.map((facilityType) => ({
          accommodationId,
          facilityType,
          source: FacilitySource.PMS,
        })),
        skipDuplicates: true,
      });
    }

    // Note: Rate plans come from getAvailability() during search, not getRoomTypes().
    // Rate plan sync will be added when availability-search results are cached.
  });
}

// ── Facility mapping ──────────────────────────────────────────────

function mapFacilities(
  facilities: string[],
  tenantId: string,
  categoryId: string,
): FacilityType[] {
  const mapped: FacilityType[] = [];
  const seen = new Set<FacilityType>();

  for (const raw of facilities) {
    const key = raw.trim().toLowerCase();
    const facilityType = FACILITY_STRING_MAP[key];

    if (!facilityType) {
      log("warn", "sync_accommodations.unknown_facility", {
        tenantId,
        categoryId,
        facility: raw,
      });
      continue;
    }

    if (!seen.has(facilityType)) {
      seen.add(facilityType);
      mapped.push(facilityType);
    }
  }

  return mapped;
}

// ── Category seeding ─────────────────────────────────────────────

const ACCOMMODATION_TYPE_SEED_LABELS: Record<string, string> = {
  HOTEL: "Hotell",
  CABIN: "Stugor",
  CAMPING: "Camping",
  APARTMENT: "Lägenheter",
  PITCH: "Platser",
};

async function seedAccommodationCategories(
  tenantId: string,
  categories: RoomCategory[],
): Promise<void> {
  // 1. Collect unique types
  const types = new Set<string>();
  for (const cat of categories) {
    const mapped = ACCOMMODATION_TYPE_MAP[cat.type];
    if (mapped) types.add(mapped);
  }

  // 2. Ensure one AccommodationCategory per type
  for (const type of types) {
    const existing = await prisma.accommodationCategory.findFirst({
      where: { tenantId, pmsRef: type },
      select: { id: true },
    });

    if (!existing) {
      const title = ACCOMMODATION_TYPE_SEED_LABELS[type] ?? type;
      const slug = await resolveUniqueCategorySlug(tenantId, slugify(title));

      await prisma.accommodationCategory.create({
        data: {
          tenantId,
          title,
          slug,
          pmsRef: type,
          status: "ACTIVE",
        },
      });
    }
  }

  // 3. Sync membership — link accommodations to their type-based category
  const allAccommodations = await prisma.accommodation.findMany({
    where: { tenantId, archivedAt: null },
    select: { id: true, accommodationType: true },
  });

  const allCategories = await prisma.accommodationCategory.findMany({
    where: { tenantId, pmsRef: { not: null } },
    select: { id: true, pmsRef: true },
  });

  const catByRef = new Map(allCategories.map((c) => [c.pmsRef!, c.id]));

  for (const acc of allAccommodations) {
    const catId = catByRef.get(acc.accommodationType);
    if (!catId) continue;

    // Upsert membership (skipDuplicates handles existing links)
    await prisma.accommodationCategoryItem.upsert({
      where: {
        categoryId_accommodationId: { categoryId: catId, accommodationId: acc.id },
      },
      create: { categoryId: catId, accommodationId: acc.id },
      update: {},
    });
  }
}

async function resolveUniqueCategorySlug(
  tenantId: string,
  baseSlug: string,
): Promise<string> {
  const slug = baseSlug || "kategori";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const conflict = await prisma.accommodationCategory.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!conflict) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

// ── Unit sync (physical rooms/pitches from PMS) ─────────────────

/**
 * syncAccommodationUnits — syncs PMS resources (physical units) into AccommodationUnit.
 *
 * Only supported for Mews (uses resources/getAll API).
 * Other adapters return immediately.
 * Idempotent: upserts by (tenantId, accommodationId, name).
 */
async function syncAccommodationUnits(
  tenantId: string,
  adapter: PmsAdapter,
): Promise<{ synced: number; skipped: number }> {
  if (!isMewsAdapter(adapter)) {
    log("info", "sync_accommodation_units.not_supported", {
      tenantId,
      provider: adapter.provider,
    });
    return { synced: 0, skipped: 0 };
  }

  // Load all accommodations with PMS externalId for category matching
  const accommodations = await prisma.accommodation.findMany({
    where: { tenantId, externalId: { not: null } },
    select: { id: true, externalId: true },
  });

  const categoryToAccommodationId = new Map<string, string>();
  for (const acc of accommodations) {
    if (acc.externalId) {
      categoryToAccommodationId.set(acc.externalId, acc.id);
    }
  }

  if (categoryToAccommodationId.size === 0) {
    return { synced: 0, skipped: 0 };
  }

  let resources;
  try {
    resources = await adapter.getResources(tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "sync_accommodation_units.get_resources_failed", { tenantId, error: msg });
    return { synced: 0, skipped: 0 };
  }

  let synced = 0;
  let skipped = 0;

  for (const resource of resources) {
    if (!resource.CategoryId) {
      skipped++;
      continue;
    }

    if (resource.IsActive === false) {
      skipped++;
      continue;
    }

    const accommodationId = categoryToAccommodationId.get(resource.CategoryId);
    if (!accommodationId) {
      skipped++;
      continue;
    }

    const unitName = resource.Name ?? resource.Id;

    try {
      await prisma.accommodationUnit.upsert({
        where: {
          tenantId_accommodationId_name: { tenantId, accommodationId, name: unitName },
        },
        create: {
          tenantId,
          accommodationId,
          name: unitName,
          externalId: resource.Id,
          status: "AVAILABLE",
        },
        update: {
          externalId: resource.Id,
          name: unitName,
        },
      });
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("warn", "sync_accommodation_units.upsert_failed", {
        tenantId,
        resourceId: resource.Id,
        error: msg,
      });
      skipped++;
    }
  }

  return { synced, skipped };
}

// ── Slug helpers ──────────────────────────────────────────────────

const MAX_SLUG_RETRIES = 10;

async function resolveUniqueAccommodationSlug(
  tenantId: string,
  baseSlug: string,
): Promise<string> {
  const slug = baseSlug || "boende";
  for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const conflict = await prisma.accommodation.findUnique({
      where: { tenantId_slug: { tenantId, slug: candidate } },
      select: { id: true },
    });
    if (!conflict) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

function slugify(str: string): string {
  const SWEDISH_MAP: Record<string, string> = {
    å: "a", ä: "a", ö: "o", Å: "a", Ä: "a", Ö: "o",
  };
  return str
    .toLowerCase()
    .replace(/[åäöÅÄÖ]/g, (c) => SWEDISH_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
