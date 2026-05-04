import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";

type Tx = Prisma.TransactionClient;

/**
 * Resolve the fulfillment country code for a DraftOrder per Q3 LOCKED.
 *
 * Tax-2 V1: tenant has ONE default fulfillment country derived from
 * `Tenant.addressCountry` (the existing schema field), normalized to
 * upper-case. Falls back to `"SE"` when null — the platform's default
 * Nordic-V1 jurisdiction.
 *
 * The recon's snippet referenced `Tenant.country` which does not exist
 * in the current schema; `Tenant.addressCountry` is the correct field.
 *
 * Future:
 *  - Tax-4 (Markets): per-Market resolution via marketId on the draft.
 *  - Multi-property: per-Accommodation property address.
 *  - TenantTaxConfig.defaultFulfillmentCountry could carry an explicit
 *    override later if a tenant fulfills from a country different from
 *    their billing address.
 *
 * The resolved country drives:
 *  - Per-category rate-lookup in builtin provider (seed-rates Nordic V1).
 *  - TenantTaxConfig provider resolution (regionScope → GLOBAL fallback).
 */
export async function resolveFulfillmentCountry(
  tenantId: string,
  tx?: Tx,
): Promise<string> {
  const db = tx ?? prisma;
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { addressCountry: true },
  });
  return tenant?.addressCountry?.toUpperCase() ?? "SE";
}
