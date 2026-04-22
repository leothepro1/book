/**
 * CompanyLocationService — locations owned by a Company.
 *
 * Invariants:
 *   • Every call carries an explicit tenantId; lookups are tenant-scoped.
 *   • A Company must always have at least one location. Deleting the last
 *     location for a Company is rejected with a ValidationError.
 *   • A location with any Orders cannot be deleted.
 *   • paymentTermsId, if set, must reference a PaymentTerms row accessible to
 *     the tenant (system default: tenantId IS NULL, or same tenantId).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import { withTranslatedErrors } from "../db/prisma-error-translator";
import {
  CreateLocationInputSchema,
  UpdateLocationPatchSchema,
  type Company,
  type CompanyLocation,
  type CreateLocationInput,
  type PaymentTerms,
  type UpdateLocationPatch,
} from "./types";

type Tx = Prisma.TransactionClient;

async function assertCompanyInTenantInTx(
  tx: Tx,
  tenantId: string,
  companyId: string,
): Promise<void> {
  const c = await tx.company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true },
  });
  if (!c) {
    throw new NotFoundError("Company not found in tenant", {
      companyId,
      tenantId,
    });
  }
}

/**
 * PaymentTerms is accessible to a tenant if:
 *   - it's a system default (tenantId IS NULL), OR
 *   - its tenantId matches.
 */
async function assertPaymentTermsAccessibleInTx(
  tx: Tx,
  tenantId: string,
  paymentTermsId: string,
): Promise<void> {
  const terms = await tx.paymentTerms.findUnique({
    where: { id: paymentTermsId },
    select: { tenantId: true },
  });
  if (!terms || (terms.tenantId !== null && terms.tenantId !== tenantId)) {
    throw new ValidationError("PaymentTerms not accessible to tenant", {
      paymentTermsId,
      tenantId,
    });
  }
}

// ── Public API ──────────────────────────────────────────────────

export async function createLocation(
  input: CreateLocationInput,
): Promise<CompanyLocation> {
  const params = CreateLocationInputSchema.parse(input);

  // Pre-checks catch NotFound + tenant-scope problems. Translator catches
  // concurrent insert races on the (tenantId, companyId, externalId) index.
  const location = await withTranslatedErrors(() =>
    prisma.$transaction(async (tx) => {
      await assertCompanyInTenantInTx(tx, params.tenantId, params.companyId);

      if (params.paymentTermsId) {
        await assertPaymentTermsAccessibleInTx(
          tx,
          params.tenantId,
          params.paymentTermsId,
        );
      }

      return tx.companyLocation.create({
        data: {
          tenantId: params.tenantId,
          companyId: params.companyId,
          name: params.name,
          externalId: params.externalId ?? null,
          billingAddress: params.billingAddress as Prisma.InputJsonValue,
          shippingAddress: params.shippingAddress
            ? (params.shippingAddress as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          paymentTermsId: params.paymentTermsId ?? null,
          depositPercent: params.depositPercent ?? 0,
          creditLimitCents: params.creditLimitCents ?? null,
          checkoutMode: params.checkoutMode ?? "AUTO_SUBMIT",
          taxSetting: params.taxSetting ?? "COLLECT",
          taxId: params.taxId ?? null,
        },
      });
    }),
  );

  log("info", "company_location.created", {
    tenantId: params.tenantId,
    companyId: params.companyId,
    locationId: location.id,
  });

  return location;
}

export async function getLocation(params: {
  tenantId: string;
  locationId: string;
}): Promise<CompanyLocation | null> {
  return prisma.companyLocation.findFirst({
    where: { id: params.locationId, tenantId: params.tenantId },
  });
}

export async function listLocations(params: {
  tenantId: string;
  companyId: string;
}): Promise<CompanyLocation[]> {
  return prisma.companyLocation.findMany({
    where: { tenantId: params.tenantId, companyId: params.companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function updateLocation(params: {
  tenantId: string;
  locationId: string;
  patch: UpdateLocationPatch;
}): Promise<CompanyLocation> {
  const patch = UpdateLocationPatchSchema.parse(params.patch);

  await prisma.$transaction(async (tx) => {
    const loc = await tx.companyLocation.findFirst({
      where: { id: params.locationId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!loc) {
      throw new NotFoundError("Location not found in tenant", {
        locationId: params.locationId,
        tenantId: params.tenantId,
      });
    }

    if (patch.paymentTermsId) {
      await assertPaymentTermsAccessibleInTx(
        tx,
        params.tenantId,
        patch.paymentTermsId,
      );
    }

    const data: Prisma.CompanyLocationUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.externalId !== undefined) data.externalId = patch.externalId;
    if (patch.billingAddress !== undefined) {
      data.billingAddress = patch.billingAddress as Prisma.InputJsonValue;
    }
    if (patch.shippingAddress !== undefined) {
      data.shippingAddress =
        patch.shippingAddress === null
          ? Prisma.JsonNull
          : (patch.shippingAddress as Prisma.InputJsonValue);
    }
    if (patch.paymentTermsId !== undefined) {
      data.paymentTerms = patch.paymentTermsId
        ? { connect: { id: patch.paymentTermsId } }
        : { disconnect: true };
    }
    if (patch.depositPercent !== undefined) {
      data.depositPercent = patch.depositPercent;
    }
    if (patch.creditLimitCents !== undefined) {
      data.creditLimitCents = patch.creditLimitCents;
    }
    if (patch.checkoutMode !== undefined) data.checkoutMode = patch.checkoutMode;
    if (patch.taxSetting !== undefined) data.taxSetting = patch.taxSetting;
    if (patch.taxId !== undefined) data.taxId = patch.taxId;
    if (patch.taxIdValidated !== undefined) {
      data.taxIdValidated = patch.taxIdValidated;
    }
    if (patch.taxExemptions !== undefined) {
      data.taxExemptions = patch.taxExemptions;
    }
    if (patch.allowOneTimeShippingAddress !== undefined) {
      data.allowOneTimeShippingAddress = patch.allowOneTimeShippingAddress;
    }
    if (patch.metafields !== undefined) {
      data.metafields =
        patch.metafields === null
          ? Prisma.JsonNull
          : (patch.metafields as Prisma.InputJsonValue);
    }

    await tx.companyLocation.update({
      where: { id: params.locationId },
      data,
    });
  });

  log("info", "company_location.updated", {
    tenantId: params.tenantId,
    locationId: params.locationId,
  });

  return (await getLocation(params)) as CompanyLocation;
}

export async function deleteLocation(params: {
  tenantId: string;
  locationId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loc = await tx.companyLocation.findFirst({
      where: { id: params.locationId, tenantId: params.tenantId },
      select: { id: true, companyId: true },
    });
    if (!loc) {
      throw new NotFoundError("Location not found in tenant", {
        locationId: params.locationId,
        tenantId: params.tenantId,
      });
    }

    const siblingCount = await tx.companyLocation.count({
      where: { companyId: loc.companyId, tenantId: params.tenantId },
    });
    if (siblingCount <= 1) {
      throw new ValidationError(
        "Cannot delete the only location for a company",
        { companyId: loc.companyId, locationId: params.locationId },
      );
    }

    const orderCount = await tx.order.count({
      where: { companyLocationId: params.locationId },
    });
    if (orderCount > 0) {
      throw new ValidationError(
        "Cannot delete a location with existing orders",
        { locationId: params.locationId, orderCount },
      );
    }

    await tx.companyLocation.delete({ where: { id: params.locationId } });
  });

  log("info", "company_location.deleted", {
    tenantId: params.tenantId,
    locationId: params.locationId,
  });
}

// ── Read-only helpers for admin detail views (FAS 4) ───────────

export type CompanyLocationSummaryRow = CompanyLocation & {
  contactCount: number;
  catalogCount: number;
  paymentTermsName: string | null;
  lastOrderAt: Date | null;
};

/**
 * Locations for a company, each hydrated with counts + lastOrderAt.
 * Five queries total regardless of how many locations: list locations,
 * groupBy contacts, groupBy assignments, findMany paymentTerms, groupBy
 * lastOrder. No N+1.
 */
export async function listLocationsForCompanyWithSummary(params: {
  tenantId: string;
  companyId: string;
}): Promise<CompanyLocationSummaryRow[]> {
  const locations = await prisma.companyLocation.findMany({
    where: { tenantId: params.tenantId, companyId: params.companyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (locations.length === 0) return [];

  const locationIds = locations.map((l) => l.id);
  const paymentTermIds = Array.from(
    new Set(
      locations.map((l) => l.paymentTermsId).filter((id): id is string => !!id),
    ),
  );

  const [
    contactGroups,
    catalogGroups,
    paymentTermRows,
    lastOrderGroups,
  ] = await Promise.all([
    prisma.companyLocationAccess.groupBy({
      by: ["companyLocationId"],
      where: {
        companyLocationId: { in: locationIds },
        tenantId: params.tenantId,
      },
      _count: { _all: true },
    }),
    prisma.companyLocationCatalog.groupBy({
      by: ["companyLocationId"],
      where: { companyLocationId: { in: locationIds } },
      _count: { _all: true },
    }),
    paymentTermIds.length > 0
      ? prisma.paymentTerms.findMany({
          where: { id: { in: paymentTermIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    prisma.order.groupBy({
      by: ["companyLocationId"],
      where: {
        companyLocationId: { in: locationIds },
        tenantId: params.tenantId,
      },
      _max: { createdAt: true },
    }),
  ]);

  const contactBy = new Map(
    contactGroups.map((g) => [g.companyLocationId, g._count._all]),
  );
  const catalogBy = new Map(
    catalogGroups.map((g) => [g.companyLocationId, g._count._all]),
  );
  const termNameBy = new Map(paymentTermRows.map((t) => [t.id, t.name]));
  const lastOrderBy = new Map<string, Date | null>();
  for (const g of lastOrderGroups) {
    if (g.companyLocationId) lastOrderBy.set(g.companyLocationId, g._max.createdAt);
  }

  return locations.map((loc) => ({
    ...loc,
    contactCount: contactBy.get(loc.id) ?? 0,
    catalogCount: catalogBy.get(loc.id) ?? 0,
    paymentTermsName: loc.paymentTermsId
      ? (termNameBy.get(loc.paymentTermsId) ?? null)
      : null,
    lastOrderAt: lastOrderBy.get(loc.id) ?? null,
  }));
}

/**
 * Location-level counts for the Overview tab. Four aggregates in parallel.
 *
 * `pendingDraftCount` is returned as null until DraftOrder is wired to a
 * location (tracked in FAS 5+); callers render "—" when null.
 */
export async function getLocationOverviewStats(params: {
  tenantId: string;
  locationId: string;
}): Promise<{
  contactCount: number;
  catalogCount: number;
  pendingDraftCount: number | null;
  outstandingBalanceCents: bigint;
}> {
  const [contactCount, catalogCount, outstandingAgg] = await Promise.all([
    prisma.companyLocationAccess.count({
      where: {
        tenantId: params.tenantId,
        companyLocationId: params.locationId,
      },
    }),
    prisma.companyLocationCatalog.count({
      where: { companyLocationId: params.locationId },
    }),
    prisma.order.aggregate({
      _sum: { balanceAmountCents: true },
      where: {
        tenantId: params.tenantId,
        companyLocationId: params.locationId,
        financialStatus: "PENDING",
        balanceAmountCents: { gt: BigInt(0) },
      },
    }),
  ]);

  return {
    contactCount,
    catalogCount,
    pendingDraftCount: null, // wired in FAS 5+ once DraftOrder exists
    outstandingBalanceCents:
      outstandingAgg._sum.balanceAmountCents ?? BigInt(0),
  };
}

/**
 * Denser bundle for the location Översikt tab — collapses the FAS 4 shape
 * (company + location + stats + balance + paymentTerms) into a single
 * Promise.all of exactly four Prisma calls.
 *
 * Query budget:
 *   1  location.findFirst  — tenant-scoped; drives not-found
 *   1  company.findFirst   — parent, for breadcrumb/header
 *   1  paymentTerms lookup (null path: skipped; net 3 queries)
 *   3  stats aggregates inside getLocationOverviewStats (contactCount,
 *      catalogCount, outstanding aggregate) — run inside the same Promise.all
 *   ─── 5 or 6 queries total depending on paymentTerms presence; the
 *       overview tab's previous 7-query shape drops by at least 2.
 *
 * The helper returns null when the location isn't found in the tenant so
 * the caller can trigger `notFound()` without a second query.
 */
export async function getLocationOverviewBundle(params: {
  tenantId: string;
  locationId: string;
}): Promise<null | {
  company: Company;
  location: CompanyLocation;
  paymentTerms: PaymentTerms | null;
  stats: {
    contactCount: number;
    catalogCount: number;
    pendingDraftCount: number | null;
    outstandingBalanceCents: bigint;
  };
  storeCreditBalanceCents: bigint;
}> {
  const location = await prisma.companyLocation.findFirst({
    where: { id: params.locationId, tenantId: params.tenantId },
  });
  if (!location) return null;

  const [company, paymentTerms, statsLite] = await Promise.all([
    prisma.company.findFirst({
      where: { id: location.companyId, tenantId: params.tenantId },
    }),
    location.paymentTermsId
      ? prisma.paymentTerms.findUnique({
          where: { id: location.paymentTermsId },
        })
      : Promise.resolve<PaymentTerms | null>(null),
    // Three aggregates in parallel inside one helper call — counted above.
    getLocationOverviewStats({
      tenantId: params.tenantId,
      locationId: location.id,
    }),
  ]);

  if (!company) return null; // parent company missing ⇒ treat as not-found

  return {
    company,
    location,
    paymentTerms: paymentTerms ?? null,
    stats: statsLite,
    storeCreditBalanceCents: location.storeCreditBalanceCents,
  };
}
