"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { revalidatePath } from "next/cache";
import type {
  AccommodationStatus,
  FacilityType,
  BedType,
  FacilitySource,
  Prisma,
} from "@prisma/client";
import { log } from "@/app/_lib/logger";
import {
  SeoMetadataSchema,
  safeParseSeoMetadata,
} from "@/app/_lib/seo/types";
import { stripEmptySeoKeys } from "@/app/_lib/seo/strip-empty";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AccommodationUpdateInput = {
  nameOverride?: string | null;
  descriptionOverride?: string | null;
  status?: AccommodationStatus;
  externalCode?: string | null;
  maxGuests?: number;
  minGuests?: number;
  extraBeds?: number;
  roomSizeSqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  facilities?: Array<{
    facilityType: FacilityType;
    source: FacilitySource;
    overrideHidden: boolean;
  }>;
  bedConfigs?: Array<{
    bedType: BedType;
    quantity: number;
  }>;
  categoryIds?: string[];
  media?: Array<{
    url: string;
    altText: string | null;
    sortOrder: number;
  }>;
  highlights?: Array<{
    icon: string;
    text: string;
    description: string;
    sortOrder: number;
  }>;
  /**
   * Per-entity SEO overrides. Shape validated at the server boundary
   * via `SeoMetadataSchema.partial()` — clients can send any subset.
   * Empty strings clear a field (merchant typed then deleted);
   * absent keys are untouched in the stored JSONB.
   */
  seo?: unknown;
};

export async function updateAccommodation(
  id: string,
  data: AccommodationUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenantId = tenantData.tenant.id;

  // Verify ownership + fetch current seo for the shallow-merge.
  // Keeping seo in the same query avoids a second round-trip.
  const existing = await prisma.accommodation.findFirst({
    where: { id, tenantId },
    select: { id: true, seo: true },
  });
  if (!existing) return { ok: false, error: "Boendet hittades inte" };

  // ── SEO: parse + merge at the save boundary ──
  //
  // Never trust client JSON — run through the same schema that
  // `/store/preferences` uses. Overrides win over stored entity.seo;
  // untouched fields (e.g. future `noindex` set by a later batch,
  // not yet editable in the current UI) carry through unchanged.
  let mergedSeoJson: Prisma.InputJsonValue | undefined;
  if (data.seo !== undefined) {
    const parsed = SeoMetadataSchema.partial().safeParse(data.seo);
    if (!parsed.success) {
      log("warn", "seo.entity.seo_invalid", {
        tenantId,
        resourceType: "accommodation",
        entityId: id,
        reason: parsed.error.message,
      });
      return { ok: false, error: "Ogiltig SEO-data" };
    }
    // Strip empty-string values BEFORE merging — a merchant who
    // cleared the title override shouldn't clobber the stored
    // entity.seo.title with `""`. "No override" = key absent.
    const stripped = stripEmptySeoKeys(parsed.data);
    const existingSeo = safeParseSeoMetadata(existing.seo) ?? {};
    const merged = { ...existingSeo, ...stripped };
    // Round-trip through JSON to strip any `undefined` values
    // Prisma's InputJsonValue rejects. The parse+spread above
    // guarantees shape validity (rule: cast accompanied by
    // boundary parse).
    mergedSeoJson = JSON.parse(JSON.stringify(merged)) as Prisma.InputJsonValue;

    log("info", "seo.entity.seo_updated", {
      tenantId,
      resourceType: "accommodation",
      entityId: id,
      fieldsChanged: Object.keys(stripped).join(","),
    });
  }

  await prisma.$transaction(async (tx) => {
    // Update overridable fields + capacity + seo.
    await tx.accommodation.update({
      where: { id },
      data: {
        ...(data.nameOverride !== undefined && { nameOverride: data.nameOverride }),
        ...(data.descriptionOverride !== undefined && { descriptionOverride: data.descriptionOverride }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.externalCode !== undefined && { externalCode: data.externalCode }),
        ...(data.maxGuests !== undefined && { maxGuests: data.maxGuests }),
        ...(data.minGuests !== undefined && { minGuests: data.minGuests }),
        ...(data.extraBeds !== undefined && { extraBeds: data.extraBeds }),
        ...(data.roomSizeSqm !== undefined && { roomSizeSqm: data.roomSizeSqm }),
        ...(data.bedrooms !== undefined && { bedrooms: data.bedrooms }),
        ...(data.bathrooms !== undefined && { bathrooms: data.bathrooms }),
        ...(mergedSeoJson !== undefined && { seo: mergedSeoJson }),
      },
    });

    // Sync facilities — replace all MANUAL facilities, update overrideHidden on PMS
    if (data.facilities) {
      // Delete existing MANUAL facilities
      await tx.accommodationFacility.deleteMany({
        where: { accommodationId: id, source: "MANUAL" },
      });

      // Update overrideHidden on PMS facilities
      const pmsFacilities = data.facilities.filter((f) => f.source === "PMS");
      for (const f of pmsFacilities) {
        await tx.accommodationFacility.updateMany({
          where: { accommodationId: id, facilityType: f.facilityType, source: "PMS" },
          data: { overrideHidden: f.overrideHidden },
        });
      }

      // Create MANUAL facilities — skipDuplicates to avoid unique constraint errors in transaction
      const manualFacilities = data.facilities.filter((f) => f.source !== "PMS");
      if (manualFacilities.length > 0) {
        await tx.accommodationFacility.createMany({
          data: manualFacilities.map((f) => ({
            accommodationId: id,
            facilityType: f.facilityType,
            source: "MANUAL" as const,
            overrideHidden: false,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Sync bed configs — delete all, recreate
    if (data.bedConfigs) {
      await tx.bedConfiguration.deleteMany({
        where: { accommodationId: id },
      });

      if (data.bedConfigs.length > 0) {
        await tx.bedConfiguration.createMany({
          data: data.bedConfigs.map((b) => ({
            accommodationId: id,
            bedType: b.bedType,
            quantity: b.quantity,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Sync media — delete all MANUAL, recreate from input
    if (data.media) {
      await tx.accommodationMedia.deleteMany({
        where: { accommodationId: id, source: "MANUAL" },
      });

      if (data.media.length > 0) {
        await tx.accommodationMedia.createMany({
          data: data.media.map((m) => ({
            accommodationId: id,
            url: m.url,
            altText: m.altText,
            sortOrder: m.sortOrder,
            source: "MANUAL" as const,
          })),
        });
      }
    }

    // Sync highlights — delete all, recreate
    if (data.highlights) {
      await tx.accommodationHighlight.deleteMany({
        where: { accommodationId: id },
      });

      if (data.highlights.length > 0) {
        await tx.accommodationHighlight.createMany({
          data: data.highlights.map((h) => ({
            accommodationId: id,
            icon: h.icon,
            text: h.text,
            description: h.description,
            sortOrder: h.sortOrder,
          })),
        });
      }
    }

    // Sync category membership — delete all, recreate
    if (data.categoryIds !== undefined) {
      await tx.accommodationCategoryItem.deleteMany({
        where: { accommodationId: id },
      });

      if (data.categoryIds.length > 0) {
        // Validate categories belong to tenant
        const validCats = await tx.accommodationCategory.findMany({
          where: { id: { in: data.categoryIds }, tenantId },
          select: { id: true },
        });
        const validIds = new Set(validCats.map((c) => c.id));
        const memberships = data.categoryIds
          .filter((catId) => validIds.has(catId))
          .map((categoryId, i) => ({ categoryId, accommodationId: id, sortOrder: i }));
        if (memberships.length > 0) {
          await tx.accommodationCategoryItem.createMany({ data: memberships });
        }
      }
    }
  });

  revalidatePath("/accommodations");
  revalidatePath(`/accommodations/${id}`);

  return { ok: true, data: { id } };
}
