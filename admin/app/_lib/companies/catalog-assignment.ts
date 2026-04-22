/**
 * CatalogAssignmentService — join-table operations between Catalog and
 * CompanyLocation.
 *
 * Both sides must belong to the same tenant; cross-tenant assignment attempts
 * raise ValidationError. The DB unique constraint on
 * (companyLocationId, catalogId) makes assignment idempotent — the service
 * returns the existing row on re-assign rather than throwing.
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
  AssignCatalogInputSchema,
  type AssignCatalogInput,
  type Catalog,
  type CompanyLocation,
  type CompanyLocationCatalog,
} from "./types";

type Tx = Prisma.TransactionClient;

async function assertBothInTenantInTx(
  tx: Tx,
  tenantId: string,
  catalogId: string,
  companyLocationId: string,
): Promise<void> {
  const [catalog, location] = await Promise.all([
    tx.catalog.findFirst({
      where: { id: catalogId, tenantId },
      select: { id: true },
    }),
    tx.companyLocation.findFirst({
      where: { id: companyLocationId, tenantId },
      select: { id: true },
    }),
  ]);
  if (!catalog) {
    throw new ValidationError("Catalog not accessible to tenant", {
      catalogId,
      tenantId,
    });
  }
  if (!location) {
    throw new ValidationError("CompanyLocation not accessible to tenant", {
      companyLocationId,
      tenantId,
    });
  }
}

export async function assignCatalogToLocation(
  input: AssignCatalogInput,
): Promise<CompanyLocationCatalog> {
  const params = AssignCatalogInputSchema.parse(input);

  const row = await withTranslatedErrors(() =>
    prisma.$transaction(async (tx) => {
      await assertBothInTenantInTx(
        tx,
        params.tenantId,
        params.catalogId,
        params.companyLocationId,
      );

      const existing = await tx.companyLocationCatalog.findUnique({
        where: {
          companyLocationId_catalogId: {
            companyLocationId: params.companyLocationId,
            catalogId: params.catalogId,
          },
        },
      });
      if (existing) return existing;

      return tx.companyLocationCatalog.create({
        data: {
          companyLocationId: params.companyLocationId,
          catalogId: params.catalogId,
        },
      });
    }),
  );

  log("info", "catalog.assigned", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
    companyLocationId: params.companyLocationId,
    assignmentId: row.id,
  });
  return row;
}

export async function unassignCatalog(params: {
  tenantId: string;
  catalogId: string;
  companyLocationId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertBothInTenantInTx(
      tx,
      params.tenantId,
      params.catalogId,
      params.companyLocationId,
    );
    const res = await tx.companyLocationCatalog.deleteMany({
      where: {
        catalogId: params.catalogId,
        companyLocationId: params.companyLocationId,
      },
    });
    if (res.count === 0) {
      throw new NotFoundError("Assignment not found", {
        catalogId: params.catalogId,
        companyLocationId: params.companyLocationId,
      });
    }
  });
  log("info", "catalog.unassigned", {
    tenantId: params.tenantId,
    catalogId: params.catalogId,
    companyLocationId: params.companyLocationId,
  });
}

export async function listCatalogsForLocation(params: {
  tenantId: string;
  companyLocationId: string;
}): Promise<Catalog[]> {
  // Tenant check on the location — rows of companyLocationCatalog have no
  // direct tenantId column, so we filter through the location relation.
  const location = await prisma.companyLocation.findFirst({
    where: { id: params.companyLocationId, tenantId: params.tenantId },
    select: { id: true },
  });
  if (!location) return [];

  const rows = await prisma.companyLocationCatalog.findMany({
    where: { companyLocationId: params.companyLocationId },
    include: { catalog: true },
    orderBy: [{ createdAt: "asc" }],
  });
  // Defensive: discard any catalogs that somehow belong to a different
  // tenant (shouldn't happen — assignment enforces same-tenant — but keeps
  // the API safe if upstream data ever drifts).
  return rows
    .map((r) => r.catalog)
    .filter((c) => c.tenantId === params.tenantId);
}

export async function listLocationsForCatalog(params: {
  tenantId: string;
  catalogId: string;
}): Promise<CompanyLocation[]> {
  const catalog = await prisma.catalog.findFirst({
    where: { id: params.catalogId, tenantId: params.tenantId },
    select: { id: true },
  });
  if (!catalog) return [];

  const rows = await prisma.companyLocationCatalog.findMany({
    where: { catalogId: params.catalogId },
    include: { catalog: false },
    orderBy: [{ createdAt: "asc" }],
  });
  const locationIds = rows.map((r) => r.companyLocationId);
  if (locationIds.length === 0) return [];

  return prisma.companyLocation.findMany({
    where: { id: { in: locationIds }, tenantId: params.tenantId },
    orderBy: [{ createdAt: "asc" }],
  });
}
