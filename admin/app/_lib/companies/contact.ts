/**
 * CompanyContactService — manage the Company ↔ GuestAccount membership rows
 * in the 3-layer B2B model.
 *
 *   Company ← CompanyContact ← CompanyLocationAccess → CompanyLocation
 *
 * A CompanyContact is the guest's membership in a company. Per-location
 * privileges are carried by the CompanyLocationAccess rows in
 * `location-access.ts`.
 *
 * Invariants:
 *   • A GuestAccount belongs to at most ONE Company globally. Enforced both
 *     by the unique (companyId, guestAccountId) index and by a cross-company
 *     pre-check in createContact.
 *   • Exactly one CompanyContact per company may have isMainContact = TRUE.
 *     Enforced at the DB by a partial unique index — service-layer promotion
 *     (setMainContact) is a 3-step transactional sequence in company.ts.
 *   • A CompanyContact flagged isMainContact cannot be removed. Callers must
 *     promote another contact first via setMainContact.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import { withTranslatedErrors } from "../db/prisma-error-translator";
import type { GuestAccount } from "@prisma/client";
import {
  CreateContactInputSchema,
  UpdateContactPatchSchema,
  type Company,
  type CompanyContact,
  type CompanyLocation,
  type CompanyLocationAccess,
  type CreateContactInput,
  type UpdateContactPatch,
} from "./types";

type Tx = Prisma.TransactionClient;

// ── Helpers ─────────────────────────────────────────────────────

async function loadCompanyInTx(
  tx: Tx,
  tenantId: string,
  companyId: string,
): Promise<{ id: string }> {
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
  return c;
}

async function resolveGuestAccountInTx(
  tx: Tx,
  tenantId: string,
  contact:
    | { guestAccountId: string }
    | { email: string; name: string },
): Promise<string> {
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
    return existing.id;
  }
  const email = contact.email.trim().toLowerCase();
  const name = contact.name.trim();
  const account = await tx.guestAccount.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, name },
    update: {},
  });
  return account.id;
}

/**
 * Enforce the one-company-per-guest invariant. Reject if the guest already
 * has a CompanyContact at a DIFFERENT company in this tenant. Same-company
 * re-invocation is idempotent — caller decides what to do.
 */
async function assertGuestFreeOfOtherCompanyInTx(
  tx: Tx,
  tenantId: string,
  guestAccountId: string,
  sameCompanyId: string,
): Promise<void> {
  const clash = await tx.companyContact.findFirst({
    where: {
      tenantId,
      guestAccountId,
      companyId: { not: sameCompanyId },
    },
    select: { id: true, companyId: true },
  });
  if (clash) {
    throw new ConflictError(
      "Guest account is already a contact at another company",
      {
        guestAccountId,
        conflictCompanyId: clash.companyId,
      },
    );
  }
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Create (or return existing) CompanyContact for a guest at a company.
 *
 * Behaviour:
 *   1. Resolve the GuestAccount (tenant-scoped lookup or upsert-by-email).
 *   2. If a CompanyContact already exists for (companyId, guestAccountId),
 *      return it — idempotent. Title/locale patches are not silently applied
 *      here; callers use updateContact for that.
 *   3. Otherwise enforce the one-company-per-guest invariant and insert.
 *   4. Optionally grant access to the caller-supplied set of locations. Each
 *      location id is validated (must belong to this company, same tenant).
 *   5. Promotion to main contact is NOT done here — callers go through
 *      setMainContact in company.ts which runs the full 3-step sequence.
 */
export async function createContact(
  input: CreateContactInput,
): Promise<CompanyContact> {
  const params = CreateContactInputSchema.parse(input);

  const result = await withTranslatedErrors(() =>
    prisma.$transaction(async (tx) => {
      await loadCompanyInTx(tx, params.tenantId, params.companyId);

      const guestId = await resolveGuestAccountInTx(
        tx,
        params.tenantId,
        params.contact,
      );

      // Idempotent: return the existing row if already present.
      const existing = await tx.companyContact.findUnique({
        where: {
          one_membership_per_guest_per_company: {
            companyId: params.companyId,
            guestAccountId: guestId,
          },
        },
      });

      let contact: CompanyContact;
      if (existing) {
        contact = existing;
      } else {
        await assertGuestFreeOfOtherCompanyInTx(
          tx,
          params.tenantId,
          guestId,
          params.companyId,
        );
        contact = await tx.companyContact.create({
          data: {
            tenantId: params.tenantId,
            companyId: params.companyId,
            guestAccountId: guestId,
            isMainContact: false,
            title: params.title ?? null,
            locale: params.locale ?? null,
          },
        });
      }

      // Optional: grant access to the listed locations. Validate that each
      // location belongs to this company (cross-company access is forbidden).
      if (
        params.grantAccessToLocationIds &&
        params.grantAccessToLocationIds.length > 0
      ) {
        const locationIds = Array.from(
          new Set(params.grantAccessToLocationIds),
        );
        const valid = await tx.companyLocation.findMany({
          where: {
            id: { in: locationIds },
            tenantId: params.tenantId,
            companyId: params.companyId,
          },
          select: { id: true },
        });
        const validIds = new Set(valid.map((l) => l.id));
        const invalid = locationIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
          throw new ValidationError(
            "One or more locations do not belong to this company",
            {
              companyId: params.companyId,
              invalidLocationIds: invalid.join(","),
            },
          );
        }

        // createMany(skipDuplicates) makes grant idempotent across concurrent
        // callers; the unique index on (contactId, locationId) covers the race.
        await tx.companyLocationAccess.createMany({
          data: Array.from(validIds).map((locationId) => ({
            tenantId: params.tenantId,
            companyContactId: contact.id,
            companyLocationId: locationId,
          })),
          skipDuplicates: true,
        });
      }

      return contact;
    }),
  );

  log("info", "company_contact.created", {
    tenantId: params.tenantId,
    companyId: params.companyId,
    contactId: result.id,
    guestAccountId: result.guestAccountId,
  });

  return result;
}

/**
 * Update mutable profile fields (title, locale) on a CompanyContact. Does
 * NOT touch isMainContact — use setMainContact for promotion.
 */
export async function updateContact(params: {
  tenantId: string;
  contactId: string;
  patch: UpdateContactPatch;
}): Promise<CompanyContact> {
  const patch = UpdateContactPatchSchema.parse(params.patch);

  // updateMany with tenantId in the filter protects against cross-tenant writes.
  const data: Prisma.CompanyContactUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.locale !== undefined) data.locale = patch.locale;

  const res = await prisma.companyContact.updateMany({
    where: { id: params.contactId, tenantId: params.tenantId },
    data,
  });
  if (res.count === 0) {
    throw new NotFoundError("Contact not found in tenant", {
      contactId: params.contactId,
      tenantId: params.tenantId,
    });
  }

  const updated = await prisma.companyContact.findFirst({
    where: { id: params.contactId, tenantId: params.tenantId },
  });

  log("info", "company_contact.updated", {
    tenantId: params.tenantId,
    contactId: params.contactId,
  });

  return updated as CompanyContact;
}

/**
 * Delete a CompanyContact. Refuses if the contact is currently the company's
 * main contact — callers must promote another contact first.
 *
 * All CompanyLocationAccess rows for this contact cascade via the FK.
 */
export async function removeContact(params: {
  tenantId: string;
  contactId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const contact = await tx.companyContact.findFirst({
      where: { id: params.contactId, tenantId: params.tenantId },
      select: { id: true, companyId: true, isMainContact: true },
    });
    if (!contact) {
      throw new NotFoundError("Contact not found in tenant", {
        contactId: params.contactId,
        tenantId: params.tenantId,
      });
    }

    if (contact.isMainContact) {
      throw new ValidationError(
        "Cannot remove the main contact — promote another contact first",
        { contactId: contact.id, companyId: contact.companyId },
      );
    }

    // Defensive: the company's mainContactId might still point here if the
    // flag was manually reset elsewhere. Refuse in that case too.
    const company = await tx.company.findFirst({
      where: { id: contact.companyId, tenantId: params.tenantId },
      select: { mainContactId: true },
    });
    if (company?.mainContactId === contact.id) {
      throw new ValidationError(
        "Cannot remove the company's main contact — promote another contact first",
        { contactId: contact.id, companyId: contact.companyId },
      );
    }

    await tx.companyContact.delete({ where: { id: contact.id } });
  });

  log("info", "company_contact.removed", {
    tenantId: params.tenantId,
    contactId: params.contactId,
  });
}

/**
 * List every CompanyContact for a company, hydrated with the GuestAccount
 * and the accessible locations. Used by the admin configure-view and by the
 * "ändra huvudkontakt" picker.
 */
export async function listContactsForCompany(params: {
  tenantId: string;
  companyId: string;
}): Promise<
  Array<
    CompanyContact & {
      guestAccount: GuestAccount;
      locationAccess: Array<
        CompanyLocationAccess & {
          companyLocation: { id: string; name: string };
        }
      >;
    }
  >
> {
  return prisma.companyContact.findMany({
    where: {
      tenantId: params.tenantId,
      companyId: params.companyId,
    },
    include: {
      guestAccount: true,
      locationAccess: {
        include: {
          companyLocation: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ isMainContact: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Tenant-scoped lookup of a single CompanyContact by (guestAccountId,
 * companyId). Returns null if none — callers can treat absence as "guest is
 * not a member of this company".
 */
export async function getContactByGuestAndCompany(params: {
  tenantId: string;
  guestAccountId: string;
  companyId: string;
}): Promise<CompanyContact | null> {
  return prisma.companyContact.findFirst({
    where: {
      tenantId: params.tenantId,
      guestAccountId: params.guestAccountId,
      companyId: params.companyId,
    },
  });
}

/**
 * The (single) Company this guest is a contact at in the given tenant, or
 * null if the guest has no membership anywhere. Relies on the
 * one-company-per-guest invariant.
 */
export async function getCompanyForGuest(params: {
  tenantId: string;
  guestAccountId: string;
}): Promise<(Company & { contact: CompanyContact }) | null> {
  const contact = await prisma.companyContact.findFirst({
    where: {
      tenantId: params.tenantId,
      guestAccountId: params.guestAccountId,
    },
    include: { company: true },
  });
  if (!contact) return null;
  const { company, ...contactOnly } = contact;
  return { ...company, contact: contactOnly };
}

/**
 * Resolve everything a B2B checkout needs for a guest in a single fetch:
 *   - The Company the guest belongs to (if any)
 *   - Their CompanyContact row (for isMainContact + title + locale)
 *   - The locations they have access to
 *
 * Returns null when the guest is not a member of any company. One query
 * graph, no N+1.
 */
export async function resolveGuestCompanyContext(params: {
  tenantId: string;
  guestAccountId: string;
}): Promise<null | {
  company: Company;
  contact: CompanyContact;
  locations: CompanyLocation[];
}> {
  const contact = await prisma.companyContact.findFirst({
    where: {
      tenantId: params.tenantId,
      guestAccountId: params.guestAccountId,
    },
    include: {
      company: true,
      locationAccess: {
        include: { companyLocation: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!contact) return null;
  const { company, locationAccess, ...contactOnly } = contact;
  return {
    company,
    contact: contactOnly,
    locations: locationAccess.map((a) => a.companyLocation),
  };
}

/**
 * Search guests who are NOT currently a CompanyContact at any company in
 * this tenant — i.e. the pool of candidates eligible to join a company as
 * a new customer. Tenant-scoped. Case-insensitive substring match on name
 * and email. Capped to `take` rows (default 20) to bound the payload.
 *
 * A guest can be a contact at AT MOST one company globally per the
 * one-company-per-guest invariant (unique index + cross-company pre-check
 * in createContact). Excluding guests with ANY CompanyContact row is
 * therefore equivalent to "guests not already tied to a company" — the
 * correct candidate set for "Lägg till kund" on a company detail page.
 */
export async function listGuestsWithoutCompany(params: {
  tenantId: string;
  query?: string;
  take?: number;
}): Promise<Array<{ id: string; email: string; firstName: string | null; lastName: string | null; name: string | null }>> {
  const take = Math.min(Math.max(params.take ?? 20, 1), 100);
  const q = params.query?.trim() ?? "";

  const where: Prisma.GuestAccountWhereInput = {
    tenantId: params.tenantId,
    NOT: { companyContacts: { some: {} } },
  };
  if (q.length > 0) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.guestAccount.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
    },
  });
}

// ── Internal — exported for sibling services in this domain ────

export { assertGuestFreeOfOtherCompanyInTx };
