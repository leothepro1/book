/**
 * CompanyLocationAccessService — grants a CompanyContact the ability to act
 * on a CompanyLocation.
 *
 * Invariants (see CompanyContact schema docblock for the full list):
 *   1. grant requires contact.companyId = location.companyId. This is the
 *      one invariant that can't be expressed by the DB schema (cross-table)
 *      so it's asserted here inside a $transaction.
 *   2. grant is idempotent — re-granting the same (contact, location) pair
 *      returns the existing row.
 *   3. revoke refuses to strip the LAST location from a contact that is
 *      currently the company's main contact. The main contact must always
 *      retain at least one access row; callers must promote another contact
 *      first or grant another location to this one.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  NotFoundError,
  ValidationError,
} from "../errors/service-errors";
import { withTranslatedErrors } from "../db/prisma-error-translator";
import type { GuestAccount } from "@prisma/client";
import {
  GrantAccessInputSchema,
  type CompanyLocation,
  type CompanyLocationAccess,
  type GrantAccessInput,
} from "./types";

type Tx = Prisma.TransactionClient;

async function loadContactInTx(
  tx: Tx,
  tenantId: string,
  contactId: string,
): Promise<{ id: string; companyId: string; isMainContact: boolean }> {
  const c = await tx.companyContact.findFirst({
    where: { id: contactId, tenantId },
    select: { id: true, companyId: true, isMainContact: true },
  });
  if (!c) {
    throw new NotFoundError("Contact not found in tenant", {
      contactId,
      tenantId,
    });
  }
  return c;
}

async function loadLocationInTx(
  tx: Tx,
  tenantId: string,
  locationId: string,
): Promise<{ id: string; companyId: string }> {
  const l = await tx.companyLocation.findFirst({
    where: { id: locationId, tenantId },
    select: { id: true, companyId: true },
  });
  if (!l) {
    throw new NotFoundError("Location not found in tenant", {
      locationId,
      tenantId,
    });
  }
  return l;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Grant a contact access to a location. Enforces the cross-table invariant
 * contact.companyId = location.companyId and is idempotent on the
 * (contactId, locationId) unique index — concurrent inserts collapse via
 * withTranslatedErrors → ConflictError, which is converted back into a
 * lookup of the existing row so callers see the same shape either way.
 */
export async function grantAccess(
  input: GrantAccessInput,
): Promise<CompanyLocationAccess> {
  const params = GrantAccessInputSchema.parse(input);

  const result = await withTranslatedErrors(() =>
    prisma.$transaction(async (tx) => {
      const contact = await loadContactInTx(
        tx,
        params.tenantId,
        params.companyContactId,
      );
      const location = await loadLocationInTx(
        tx,
        params.tenantId,
        params.companyLocationId,
      );

      if (contact.companyId !== location.companyId) {
        throw new ValidationError(
          "Contact and location belong to different companies",
          {
            contactCompanyId: contact.companyId,
            locationCompanyId: location.companyId,
          },
        );
      }

      // Idempotent: return the existing row if present.
      const existing = await tx.companyLocationAccess.findUnique({
        where: {
          one_access_per_contact_per_location: {
            companyContactId: params.companyContactId,
            companyLocationId: params.companyLocationId,
          },
        },
      });
      if (existing) return existing;

      return tx.companyLocationAccess.create({
        data: {
          tenantId: params.tenantId,
          companyContactId: params.companyContactId,
          companyLocationId: params.companyLocationId,
        },
      });
    }),
  );

  log("info", "company_location_access.granted", {
    tenantId: params.tenantId,
    companyContactId: params.companyContactId,
    companyLocationId: params.companyLocationId,
    accessId: result.id,
  });

  return result;
}

/**
 * Revoke access. Refuses to strip the last location from a main contact —
 * the main must always have at least one place they can act on. Callers must
 * grant another location or promote another contact first.
 */
export async function revokeAccess(
  input: GrantAccessInput,
): Promise<void> {
  const params = GrantAccessInputSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const contact = await loadContactInTx(
      tx,
      params.tenantId,
      params.companyContactId,
    );

    const access = await tx.companyLocationAccess.findUnique({
      where: {
        one_access_per_contact_per_location: {
          companyContactId: params.companyContactId,
          companyLocationId: params.companyLocationId,
        },
      },
      select: { id: true },
    });
    if (!access) {
      throw new NotFoundError("Access grant not found", {
        companyContactId: params.companyContactId,
        companyLocationId: params.companyLocationId,
      });
    }

    if (contact.isMainContact) {
      const remaining = await tx.companyLocationAccess.count({
        where: {
          companyContactId: params.companyContactId,
          NOT: { id: access.id },
        },
      });
      if (remaining === 0) {
        throw new ValidationError(
          "Cannot revoke the last location from the main contact — grant another location or promote a different contact first",
          { companyContactId: params.companyContactId },
        );
      }
    }

    await tx.companyLocationAccess.delete({ where: { id: access.id } });
  });

  log("info", "company_location_access.revoked", {
    tenantId: params.tenantId,
    companyContactId: params.companyContactId,
    companyLocationId: params.companyLocationId,
  });
}

/**
 * All locations a contact can act on. Tenant-scoped via the contact lookup
 * (the access row's tenantId is denormalized, but the trust root is the
 * contact).
 */
export async function listAccessForContact(params: {
  tenantId: string;
  companyContactId: string;
}): Promise<
  Array<CompanyLocationAccess & { companyLocation: CompanyLocation }>
> {
  return prisma.companyLocationAccess.findMany({
    where: {
      tenantId: params.tenantId,
      companyContactId: params.companyContactId,
    },
    include: { companyLocation: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * All contacts with access to a given location, hydrated with the guest
 * account and the main-contact flag. Used by the location-detail Kontakter
 * tab.
 */
export async function listContactsWithAccessToLocation(params: {
  tenantId: string;
  companyLocationId: string;
}): Promise<
  Array<
    CompanyLocationAccess & {
      companyContact: {
        id: string;
        isMainContact: boolean;
        title: string | null;
        guestAccount: GuestAccount;
      };
    }
  >
> {
  return prisma.companyLocationAccess.findMany({
    where: {
      tenantId: params.tenantId,
      companyLocationId: params.companyLocationId,
    },
    include: {
      companyContact: {
        select: {
          id: true,
          isMainContact: true,
          title: true,
          guestAccount: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

/**
 * Authoritative yes/no check — used by checkout and by admin actions that
 * guard location-scoped mutations.
 */
export async function hasAccess(params: {
  tenantId: string;
  companyContactId: string;
  companyLocationId: string;
}): Promise<boolean> {
  const row = await prisma.companyLocationAccess.findFirst({
    where: {
      tenantId: params.tenantId,
      companyContactId: params.companyContactId,
      companyLocationId: params.companyLocationId,
    },
    select: { id: true },
  });
  return row !== null;
}
