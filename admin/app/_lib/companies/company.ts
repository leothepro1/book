/**
 * CompanyService — all Company-level reads/writes for B2B ("Företag").
 *
 * FAS 5.5 — 3-layer contact model:
 *   Company ← CompanyContact ← CompanyLocationAccess → CompanyLocation
 *
 * Invariants:
 *   • tenantId is always an explicit parameter — never inferred.
 *   • createCompany is fully atomic: GuestAccount upsert + Company +
 *     CompanyLocation + CompanyContact + CompanyLocationAccess +
 *     Company.mainContactId all happen inside one $transaction. Rollback on
 *     any failure.
 *   • A GuestAccount can be a contact in at most one Company (globally).
 *     Enforced by the unique (companyId, guestAccountId) index AND a
 *     cross-company pre-check.
 *   • At most one CompanyContact per company has isMainContact = TRUE
 *     (partial unique index).
 *   • The new main contact MUST have access to at least one location.
 *   • Cross-tenant reads return null, never leak rows.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import {
  CreateCompanyInputSchema,
  ListCompaniesInputSchema,
  UpdateCompanyPatchSchema,
  UpdateLocationPatchSchema,
  type Company,
  type CompanyContact,
  type CompanyLocation,
  type CompanyLocationAccess,
  type CreateCompanyInput,
  type ListCompaniesInput,
  type UpdateCompanyPatch,
  type UpdateLocationPatch,
} from "./types";

type Tx = Prisma.TransactionClient;

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Resolve a GuestAccount to use as a contact — either look up an existing one
 * (and verify tenant ownership) or upsert-by-email for a new invite. Runs
 * inside the caller's transaction.
 */
async function resolveContactGuestAccountInTx(
  tx: Tx,
  tenantId: string,
  contact:
    | { guestAccountId: string }
    | { newGuestEmail: string; newGuestName: string },
): Promise<{ id: string; created: boolean }> {
  if ("guestAccountId" in contact) {
    const existing = await tx.guestAccount.findFirst({
      where: { id: contact.guestAccountId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Guest account not found in tenant", {
        guestAccountId: contact.guestAccountId,
        tenantId,
      });
    }
    return { id: existing.id, created: false };
  }

  const email = contact.newGuestEmail.trim().toLowerCase();
  const name = contact.newGuestName.trim();
  const before = await tx.guestAccount.findUnique({
    where: { tenantId_email: { tenantId, email } },
    select: { id: true },
  });
  const account = await tx.guestAccount.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, name },
    update: {},
  });
  return { id: account.id, created: !before };
}

// ── Public API ──────────────────────────────────────────────────

export async function createCompany(
  input: CreateCompanyInput,
): Promise<{
  company: Company;
  firstLocation: CompanyLocation;
  mainContact: CompanyContact;
  mainContactAccess: CompanyLocationAccess;
}> {
  const params = CreateCompanyInputSchema.parse(input);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Resolve or create the main-contact GuestAccount.
    const guest = await resolveContactGuestAccountInTx(
      tx,
      params.tenantId,
      "guestAccountId" in params.mainContact
        ? { guestAccountId: params.mainContact.guestAccountId }
        : {
            newGuestEmail: params.mainContact.newGuestEmail,
            newGuestName: params.mainContact.newGuestName,
          },
    );

    // 2. Reject if this guest is already a contact in another company.
    //    Pre-check runs before any write; the unique index is still the
    //    authoritative gate against concurrent inserts.
    const existingCompany = await tx.companyContact.findFirst({
      where: { tenantId: params.tenantId, guestAccountId: guest.id },
      select: { id: true, companyId: true },
    });
    if (existingCompany) {
      throw new ConflictError(
        "Guest account is already a contact at another company",
        {
          guestAccountId: guest.id,
          conflictCompanyId: existingCompany.companyId,
        },
      );
    }

    // 3. Create Company (mainContactId set after contact is created).
    const company = await tx.company.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        externalId: params.externalId ?? null,
        tags: params.tags ?? [],
        note: params.note ?? null,
      },
    });

    // 4. Create first CompanyLocation.
    const firstLocation = await tx.companyLocation.create({
      data: {
        tenantId: params.tenantId,
        companyId: company.id,
        name: params.firstLocation.name,
        externalId: params.firstLocation.externalId ?? null,
        billingAddress: params.firstLocation
          .billingAddress as Prisma.InputJsonValue,
        shippingAddress: params.firstLocation.shippingAddress
          ? (params.firstLocation.shippingAddress as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    // 5. Create CompanyContact marked as main.
    const mainContact = await tx.companyContact.create({
      data: {
        tenantId: params.tenantId,
        companyId: company.id,
        guestAccountId: guest.id,
        isMainContact: true,
        title: params.mainContact.title ?? null,
        locale: params.mainContact.locale ?? null,
      },
    });

    // 6. Grant the main contact access to the first location.
    const mainContactAccess = await tx.companyLocationAccess.create({
      data: {
        tenantId: params.tenantId,
        companyContactId: mainContact.id,
        companyLocationId: firstLocation.id,
      },
    });

    // 7. Set Company.mainContactId now that the contact row exists.
    const updatedCompany = await tx.company.update({
      where: { id: company.id },
      data: { mainContactId: mainContact.id },
    });

    return {
      company: updatedCompany,
      firstLocation,
      mainContact,
      mainContactAccess,
    };
  });

  log("info", "company.created", {
    tenantId: params.tenantId,
    companyId: result.company.id,
    locationId: result.firstLocation.id,
    mainContactId: result.mainContact.id,
  });

  return result;
}

export async function getCompany(params: {
  tenantId: string;
  companyId: string;
}): Promise<Company | null> {
  return prisma.company.findFirst({
    where: { id: params.companyId, tenantId: params.tenantId },
  });
}

export async function listCompanies(
  input: ListCompaniesInput,
): Promise<{ companies: Company[]; nextCursor: string | null }> {
  const params = ListCompaniesInputSchema.parse(input);

  const search = params.search?.trim();
  const where: Prisma.CompanyWhereInput = {
    tenantId: params.tenantId,
    ...(params.status ? { status: params.status } : {}),
    ...(typeof params.orderingApproved === "boolean"
      ? { orderingApproved: params.orderingApproved }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { externalId: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.company.findMany({
    where,
    take: params.take + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
  });

  const hasMore = rows.length > params.take;
  const companies = hasMore ? rows.slice(0, params.take) : rows;
  const nextCursor = hasMore ? companies[companies.length - 1].id : null;

  return { companies, nextCursor };
}

export async function updateCompany(params: {
  tenantId: string;
  companyId: string;
  patch: UpdateCompanyPatch;
}): Promise<Company> {
  const patch = UpdateCompanyPatchSchema.parse(params.patch);

  // Tenant-scoped update — updateMany protects against cross-tenant writes.
  const res = await prisma.company.updateMany({
    where: { id: params.companyId, tenantId: params.tenantId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.externalId !== undefined
        ? { externalId: patch.externalId }
        : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.metafields !== undefined
        ? {
            metafields:
              patch.metafields === null
                ? Prisma.JsonNull
                : (patch.metafields as Prisma.InputJsonValue),
          }
        : {}),
    },
  });
  if (res.count === 0) {
    throw new NotFoundError("Company not found in tenant", {
      companyId: params.companyId,
      tenantId: params.tenantId,
    });
  }
  return (await getCompany(params)) as Company;
}

/**
 * Atomic "edit company profile" — updates Company + the company's first
 * CompanyLocation in one transaction. Used by the admin "Redigera
 * företagsuppgifter" modal, which presents both the Company-level fields
 * (name, externalId, tags, note) and the first-location-scoped fields
 * (billing address, taxId/orgnr, paymentTermsId, taxSetting) as one form.
 *
 * The "first location" is the company's oldest CompanyLocation (createdAt
 * ASC) — the same row that createCompany seeded at creation time. That is
 * where org-number and billing address live for the common single-location
 * company; multi-location companies edit other locations from their own
 * detail pages.
 *
 * Atomicity matters: partial success (company renamed but address save
 * failed, or vice versa) leaves the admin UI inconsistent. Both updates
 * run inside the same `$transaction` so a failure on either side rolls
 * both back.
 *
 * Returns the refreshed rows so the caller can revalidate with confidence.
 */
export async function updateCompanyProfile(params: {
  tenantId: string;
  companyId: string;
  companyPatch?: UpdateCompanyPatch;
  firstLocationPatch?: UpdateLocationPatch;
}): Promise<{ company: Company; firstLocation: CompanyLocation | null }> {
  const companyPatch = params.companyPatch
    ? UpdateCompanyPatchSchema.parse(params.companyPatch)
    : undefined;
  const firstLocationPatch = params.firstLocationPatch
    ? UpdateLocationPatchSchema.parse(params.firstLocationPatch)
    : undefined;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Company row must exist in this tenant. Holds the authoritative
    //    tenantId for later paymentTerms access check.
    const company = await tx.company.findFirst({
      where: { id: params.companyId, tenantId: params.tenantId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundError("Company not found in tenant", {
        companyId: params.companyId,
        tenantId: params.tenantId,
      });
    }

    // 2. Apply Company patch (only touched fields).
    if (companyPatch) {
      const data: Prisma.CompanyUpdateInput = {};
      if (companyPatch.name !== undefined) data.name = companyPatch.name;
      if (companyPatch.externalId !== undefined) {
        data.externalId = companyPatch.externalId;
      }
      if (companyPatch.tags !== undefined) data.tags = companyPatch.tags;
      if (companyPatch.note !== undefined) data.note = companyPatch.note;
      if (companyPatch.metafields !== undefined) {
        data.metafields =
          companyPatch.metafields === null
            ? Prisma.JsonNull
            : (companyPatch.metafields as Prisma.InputJsonValue);
      }
      if (Object.keys(data).length > 0) {
        await tx.company.update({
          where: { id: params.companyId },
          data,
        });
      }
    }

    // 3. Look up the first location (oldest), then apply firstLocationPatch.
    const firstLocation = await tx.companyLocation.findFirst({
      where: { tenantId: params.tenantId, companyId: params.companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    if (firstLocationPatch && firstLocation) {
      // Validate paymentTermsId accessibility before the write — mirrors
      // the single-location updateLocation service.
      if (firstLocationPatch.paymentTermsId) {
        const terms = await tx.paymentTerms.findUnique({
          where: { id: firstLocationPatch.paymentTermsId },
          select: { tenantId: true },
        });
        if (!terms) {
          throw new NotFoundError("Payment terms not found", {
            paymentTermsId: firstLocationPatch.paymentTermsId,
          });
        }
        if (terms.tenantId !== null && terms.tenantId !== params.tenantId) {
          throw new ValidationError(
            "Payment terms not accessible to this tenant",
            {
              paymentTermsId: firstLocationPatch.paymentTermsId,
              tenantId: params.tenantId,
            },
          );
        }
      }

      const data: Prisma.CompanyLocationUpdateInput = {};
      if (firstLocationPatch.name !== undefined) {
        data.name = firstLocationPatch.name;
      }
      if (firstLocationPatch.externalId !== undefined) {
        data.externalId = firstLocationPatch.externalId;
      }
      if (firstLocationPatch.billingAddress !== undefined) {
        data.billingAddress =
          firstLocationPatch.billingAddress as Prisma.InputJsonValue;
      }
      if (firstLocationPatch.shippingAddress !== undefined) {
        data.shippingAddress =
          firstLocationPatch.shippingAddress === null
            ? Prisma.JsonNull
            : (firstLocationPatch.shippingAddress as Prisma.InputJsonValue);
      }
      if (firstLocationPatch.paymentTermsId !== undefined) {
        data.paymentTerms = firstLocationPatch.paymentTermsId
          ? { connect: { id: firstLocationPatch.paymentTermsId } }
          : { disconnect: true };
      }
      if (firstLocationPatch.depositPercent !== undefined) {
        data.depositPercent = firstLocationPatch.depositPercent;
      }
      if (firstLocationPatch.creditLimitCents !== undefined) {
        data.creditLimitCents = firstLocationPatch.creditLimitCents;
      }
      if (firstLocationPatch.checkoutMode !== undefined) {
        data.checkoutMode = firstLocationPatch.checkoutMode;
      }
      if (firstLocationPatch.taxSetting !== undefined) {
        data.taxSetting = firstLocationPatch.taxSetting;
      }
      if (firstLocationPatch.taxId !== undefined) {
        data.taxId = firstLocationPatch.taxId;
      }
      if (firstLocationPatch.taxIdValidated !== undefined) {
        data.taxIdValidated = firstLocationPatch.taxIdValidated;
      }
      if (firstLocationPatch.taxExemptions !== undefined) {
        data.taxExemptions = firstLocationPatch.taxExemptions;
      }
      if (firstLocationPatch.allowOneTimeShippingAddress !== undefined) {
        data.allowOneTimeShippingAddress =
          firstLocationPatch.allowOneTimeShippingAddress;
      }
      if (firstLocationPatch.metafields !== undefined) {
        data.metafields =
          firstLocationPatch.metafields === null
            ? Prisma.JsonNull
            : (firstLocationPatch.metafields as Prisma.InputJsonValue);
      }
      if (Object.keys(data).length > 0) {
        await tx.companyLocation.update({
          where: { id: firstLocation.id },
          data,
        });
      }
    }

    const companyAfter = await tx.company.findFirst({
      where: { id: params.companyId, tenantId: params.tenantId },
    });
    const firstLocationAfter = firstLocation
      ? await tx.companyLocation.findFirst({
          where: { id: firstLocation.id, tenantId: params.tenantId },
        })
      : null;
    return { company: companyAfter as Company, firstLocation: firstLocationAfter };
  });

  log("info", "company.profile_updated", {
    tenantId: params.tenantId,
    companyId: params.companyId,
    companyFields: companyPatch ? Object.keys(companyPatch).join(",") : "",
    locationFields: firstLocationPatch
      ? Object.keys(firstLocationPatch).join(",")
      : "",
  });

  return result;
}

async function setCompanyStatus(
  params: { tenantId: string; companyId: string },
  status: "ACTIVE" | "ARCHIVED",
): Promise<Company> {
  const res = await prisma.company.updateMany({
    where: { id: params.companyId, tenantId: params.tenantId },
    data: { status },
  });
  if (res.count === 0) {
    throw new NotFoundError("Company not found in tenant", {
      companyId: params.companyId,
      tenantId: params.tenantId,
    });
  }
  log("info", "company.status_changed", {
    tenantId: params.tenantId,
    companyId: params.companyId,
    status,
  });
  return (await getCompany(params)) as Company;
}

export function archiveCompany(params: {
  tenantId: string;
  companyId: string;
}): Promise<Company> {
  return setCompanyStatus(params, "ARCHIVED");
}

export function unarchiveCompany(params: {
  tenantId: string;
  companyId: string;
}): Promise<Company> {
  return setCompanyStatus(params, "ACTIVE");
}

/**
 * Move the "main contact" flag atomically. In the 3-layer model the main
 * must have access to at least one location — otherwise they cannot act on
 * behalf of the company at all.
 *
 *   1. Verify the new contact exists in tenant AND belongs to this company.
 *   2. Verify the new contact has at least one CompanyLocationAccess row.
 *   3. Clear isMainContact on the previous main (defensive updateMany).
 *   4. Set isMainContact = true on the new contact.
 *   5. Update Company.mainContactId.
 *
 * All five steps commit in one $transaction. The partial unique index is
 * the authoritative backstop against a race creating two mains.
 */
export async function setMainContact(params: {
  tenantId: string;
  companyId: string;
  contactId: string;
}): Promise<Company> {
  const updated = await prisma.$transaction(async (tx) => {
    const contact = await tx.companyContact.findFirst({
      where: { id: params.contactId, tenantId: params.tenantId },
      select: { id: true, companyId: true },
    });
    if (!contact) {
      throw new NotFoundError("Contact not found in tenant", {
        contactId: params.contactId,
        tenantId: params.tenantId,
      });
    }
    if (contact.companyId !== params.companyId) {
      throw new ValidationError(
        "Contact does not belong to this company",
        {
          contactId: params.contactId,
          expectedCompanyId: params.companyId,
          actualCompanyId: contact.companyId,
        },
      );
    }

    const accessCount = await tx.companyLocationAccess.count({
      where: { companyContactId: params.contactId },
    });
    if (accessCount === 0) {
      throw new ValidationError(
        "New main contact must have access to at least one location",
        { contactId: params.contactId, companyId: params.companyId },
      );
    }

    await tx.companyContact.updateMany({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        isMainContact: true,
        id: { not: params.contactId },
      },
      data: { isMainContact: false },
    });

    await tx.companyContact.update({
      where: { id: params.contactId },
      data: { isMainContact: true },
    });

    const company = await tx.company.update({
      where: { id: params.companyId },
      data: { mainContactId: params.contactId },
    });
    return company;
  });

  log("info", "company.main_contact_set", {
    tenantId: params.tenantId,
    companyId: params.companyId,
    contactId: params.contactId,
  });

  return updated;
}

// ── Read-only helpers for admin list/detail views (FAS 4) ──────

import type { GuestAccount } from "@prisma/client";

export type CompanyListRow = Company & {
  mainContact: (CompanyContact & { guestAccount: GuestAccount }) | null;
  locationCount: number;
};

/**
 * Admin-list variant of listCompanies that hydrates mainContact + locationCount
 * in batch. Companies is the primary fetch; contacts are loaded in one
 * secondary query keyed by the distinct mainContactIds; location counts come
 * from a single groupBy. Three queries total, no N+1 regardless of page size.
 */
export async function listCompaniesWithMainContacts(
  input: ListCompaniesInput,
): Promise<{ companies: CompanyListRow[]; nextCursor: string | null }> {
  const base = await listCompanies(input);
  const companies = base.companies;
  if (companies.length === 0) {
    return { companies: [], nextCursor: base.nextCursor };
  }

  const mainContactIds = Array.from(
    new Set(
      companies.map((c) => c.mainContactId).filter((id): id is string => !!id),
    ),
  );
  const companyIds = companies.map((c) => c.id);

  const [contacts, locationGroups] = await Promise.all([
    mainContactIds.length > 0
      ? prisma.companyContact.findMany({
          where: { id: { in: mainContactIds }, tenantId: input.tenantId },
          include: { guestAccount: true },
        })
      : Promise.resolve(
          [] as Array<CompanyContact & { guestAccount: GuestAccount }>,
        ),
    prisma.companyLocation.groupBy({
      by: ["companyId"],
      where: { companyId: { in: companyIds }, tenantId: input.tenantId },
      _count: { _all: true },
    }),
  ]);

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const locationCountByCompany = new Map(
    locationGroups.map((g) => [g.companyId, g._count._all]),
  );

  const rows: CompanyListRow[] = companies.map((c) => ({
    ...c,
    mainContact: c.mainContactId
      ? (contactById.get(c.mainContactId) ?? null)
      : null,
    locationCount: locationCountByCompany.get(c.id) ?? 0,
  }));

  return { companies: rows, nextCursor: base.nextCursor };
}

/**
 * Counts-only snapshot for a company. Five independent aggregate reads in
 * parallel — cheap, and callers need every column.
 *
 * "Active order" approximates Shopify's open-orders notion: not-cancelled,
 * not-refunded. Outstanding / overdue approximate on existing enum values;
 * a first-class PAYMENT_PENDING/OVERDUE financialStatus is future work.
 */
export async function getCompanyOverviewStats(params: {
  tenantId: string;
  companyId: string;
}): Promise<{
  locationCount: number;
  contactCount: number;
  activeOrderCount: number;
  outstandingBalanceCents: bigint;
  overdueOrderCount: number;
}> {
  const now = new Date();
  const [
    locationCount,
    contactCount,
    activeOrderCount,
    outstandingAgg,
    overdueOrderCount,
  ] = await Promise.all([
    prisma.companyLocation.count({
      where: { companyId: params.companyId, tenantId: params.tenantId },
    }),
    prisma.companyContact.count({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
      },
    }),
    prisma.order.count({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        status: { notIn: ["CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"] },
      },
    }),
    prisma.order.aggregate({
      _sum: { balanceAmountCents: true },
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        financialStatus: "PENDING",
        balanceAmountCents: { gt: BigInt(0) },
      },
    }),
    prisma.order.count({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        financialStatus: "PENDING",
        paymentDueAt: { lt: now },
      },
    }),
  ]);

  return {
    locationCount,
    contactCount,
    activeOrderCount,
    outstandingBalanceCents:
      outstandingAgg._sum.balanceAmountCents ?? BigInt(0),
    overdueOrderCount,
  };
}
