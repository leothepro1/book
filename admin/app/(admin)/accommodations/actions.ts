"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { revalidatePath } from "next/cache";
import type { AccommodationStatus, FacilityType, BedType, FacilitySource } from "@prisma/client";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AccommodationUpdateInput = {
  nameOverride?: string | null;
  descriptionOverride?: string | null;
  status?: AccommodationStatus;
  externalCode?: string | null;
  facilities?: Array<{
    facilityType: FacilityType;
    source: FacilitySource;
    overrideHidden: boolean;
  }>;
  bedConfigs?: Array<{
    bedType: BedType;
    quantity: number;
  }>;
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

  // Verify ownership
  const existing = await prisma.accommodation.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Boendet hittades inte" };

  await prisma.$transaction(async (tx) => {
    // Update overridable fields
    await tx.accommodation.update({
      where: { id },
      data: {
        ...(data.nameOverride !== undefined && { nameOverride: data.nameOverride }),
        ...(data.descriptionOverride !== undefined && { descriptionOverride: data.descriptionOverride }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.externalCode !== undefined && { externalCode: data.externalCode }),
      },
    });

    // Sync facilities — replace all MANUAL facilities, update overrideHidden on PMS
    if (data.facilities) {
      // Delete existing MANUAL facilities
      await tx.accommodationFacility.deleteMany({
        where: { accommodationId: id, source: "MANUAL" },
      });

      // Update overrideHidden on PMS facilities
      for (const f of data.facilities) {
        if (f.source === "PMS") {
          await tx.accommodationFacility.updateMany({
            where: { accommodationId: id, facilityType: f.facilityType, source: "PMS" },
            data: { overrideHidden: f.overrideHidden },
          });
        } else {
          // Create MANUAL facility
          await tx.accommodationFacility.create({
            data: {
              accommodationId: id,
              facilityType: f.facilityType,
              source: "MANUAL",
              overrideHidden: false,
            },
          }).catch(() => {}); // Skip duplicates
        }
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
  });

  revalidatePath("/accommodations");
  revalidatePath(`/accommodations/${id}`);

  return { ok: true, data: { id } };
}
