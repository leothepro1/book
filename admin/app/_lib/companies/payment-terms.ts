/**
 * PaymentTermsService — system defaults + tenant-custom payment terms.
 *
 * Access model:
 *   • System defaults: tenantId = NULL (seeded in prisma/seed.js).
 *   • Tenant customs:  tenantId = this tenant.
 *   • listAvailableTerms returns the union (system first, then custom A→Z).
 *
 * Snapshot contract:
 *   • snapshotTerms() returns the JSON blob that is frozen onto
 *     Order.paymentTermsSnapshot at order creation. Shape defined in
 *     PaymentTermsSnapshotSchema.
 *   • computeDueDate() is a pure function that derives the invoice due date
 *     from a snapshot. Does NOT touch the DB.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import {
  CreateCustomTermInputSchema,
  type CreateCustomTermInput,
  type PaymentTerms,
  type PaymentTermsSnapshot,
} from "./types";

// ── Public API ──────────────────────────────────────────────────

/**
 * List every PaymentTerms accessible to a tenant.
 * Ordering: system defaults first (in insertion order, name A→Z); then tenant
 * customs (name A→Z).
 */
export async function listAvailableTerms(params: {
  tenantId: string;
}): Promise<PaymentTerms[]> {
  const rows = await prisma.paymentTerms.findMany({
    where: {
      OR: [{ tenantId: null }, { tenantId: params.tenantId }],
    },
    // Custom rows sort AFTER system defaults because NULL < any string only
    // when nulls are FIRST in Postgres; we enforce order client-side to keep
    // it predictable across locales.
    orderBy: [{ name: "asc" }],
  });
  const system = rows.filter((r) => r.tenantId === null);
  const custom = rows.filter((r) => r.tenantId !== null);
  return [...system, ...custom];
}

export async function createCustomTerm(
  input: CreateCustomTermInput,
): Promise<PaymentTerms> {
  // Zod's refine() runs inside .parse() — this rejects NET-without-netDays and
  // FIXED_DATE-without-fixedDate before the DB call.
  const params = CreateCustomTermInputSchema.parse(input);

  if (params.type === "FIXED_DATE" && params.fixedDate) {
    const now = Date.now();
    if (params.fixedDate.getTime() <= now) {
      throw new ValidationError("FIXED_DATE must be in the future", {
        fixedDate: params.fixedDate.toISOString(),
      });
    }
  }

  const row = await prisma.paymentTerms.create({
    data: {
      tenantId: params.tenantId,
      name: params.name,
      type: params.type,
      netDays: params.netDays ?? null,
      fixedDate: params.fixedDate ?? null,
    },
  });

  log("info", "payment_terms.custom_created", {
    tenantId: params.tenantId,
    termsId: row.id,
    type: row.type,
  });

  return row;
}

/**
 * Fetch a single PaymentTerms row. Accessible if it's a system default
 * (tenantId IS NULL) OR belongs to this tenant. Returns null otherwise.
 */
export async function getTerms(params: {
  tenantId: string;
  termsId: string;
}): Promise<PaymentTerms | null> {
  const row = await prisma.paymentTerms.findUnique({
    where: { id: params.termsId },
  });
  if (!row) return null;
  if (row.tenantId !== null && row.tenantId !== params.tenantId) return null;
  return row;
}

export async function snapshotTerms(params: {
  tenantId: string;
  termsId: string;
}): Promise<PaymentTermsSnapshot> {
  const terms = await getTerms(params);
  if (!terms) {
    throw new NotFoundError("PaymentTerms not accessible to tenant", {
      termsId: params.termsId,
      tenantId: params.tenantId,
    });
  }
  return {
    termsId: terms.id,
    name: terms.name,
    type: terms.type,
    netDays: terms.netDays,
    fixedDate: terms.fixedDate ? terms.fixedDate.toISOString() : null,
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Derive the invoice due-date from a snapshot. Returns null for
 * DUE_ON_FULFILLMENT because that type is not computable until fulfillment
 * actually occurs.
 */
export function computeDueDate(
  snapshot: PaymentTermsSnapshot,
  orderCreatedAt: Date,
): Date | null {
  switch (snapshot.type) {
    case "DUE_ON_RECEIPT":
      return new Date(orderCreatedAt);
    case "DUE_ON_FULFILLMENT":
      return null;
    case "NET": {
      if (typeof snapshot.netDays !== "number" || snapshot.netDays <= 0) {
        throw new ValidationError("NET snapshot missing netDays", {
          termsId: snapshot.termsId,
        });
      }
      const d = new Date(orderCreatedAt);
      d.setUTCDate(d.getUTCDate() + snapshot.netDays);
      return d;
    }
    case "FIXED_DATE": {
      if (!snapshot.fixedDate) {
        throw new ValidationError("FIXED_DATE snapshot missing fixedDate", {
          termsId: snapshot.termsId,
        });
      }
      return new Date(snapshot.fixedDate);
    }
  }
}
