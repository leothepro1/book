"use server";

/**
 * Companies — server actions layer.
 *
 * Every write the admin UI performs routes through these functions. Each one:
 *   1. Asserts admin auth via `requireAdmin` (403-style path returns).
 *   2. Resolves tenantId from session via `getCurrentTenant` — **never** accepts
 *      a client-supplied tenantId.
 *   3. Delegates to the domain services in `app/_lib/companies/*`.
 *   4. Catches and maps service errors via `mapServiceErrorToMessage` so the
 *      client sees a single Swedish message regardless of where the throw
 *      originated.
 *   5. Revalidates the relevant admin paths so server components refetch.
 *
 * Return shape is the existing repo convention:
 *     { ok: true, data: T } | { ok: false, error: string }
 *
 * FAS 5.5: 3-layer contact model. Contact writes are split across:
 *   - createContactAction        — new CompanyContact (+ optional initial access)
 *   - removeContactAction        — delete a CompanyContact (must not be main)
 *   - grantAccessAction          — add a CompanyLocationAccess
 *   - revokeAccessAction         — remove a CompanyLocationAccess
 *   - setMainContactAction       — promote a different contact to main
 * Roles are gone; "access to a location" is binary.
 */

import { revalidatePath } from "next/cache";
import type { StoreCreditReason } from "@prisma/client";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { listGuestAccounts } from "@/app/_lib/guests/queries";
import { createCompanyEvent } from "@/app/_lib/companies/events";
import {
  addInclusion,
  archiveCompany,
  assignCatalogToLocation,
  createCompany,
  createContact,
  createLocation,
  deleteLocation,
  grantAccess,
  issueCredit,
  mapServiceErrorToMessage,
  removeContact,
  revokeAccess,
  setMainContact,
  unarchiveCompany,
  unassignCatalog,
  updateCompany,
  updateLocation,
} from "@/app/_lib/companies";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Guard helper ────────────────────────────────────────────────

async function requireContext(): Promise<
  | { ok: true; tenantId: string; staffUserId: string }
  | { ok: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await getCurrentTenant();
  if (!session) return { ok: false, error: "Inte inloggad" };
  return {
    ok: true,
    tenantId: session.tenant.id,
    staffUserId: session.clerkUserId,
  };
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: mapServiceErrorToMessage(err) };
}

function revalidateCompanyPaths(companyId: string, locationId?: string) {
  revalidatePath("/customers/companies");
  revalidatePath(`/customers/companies/${companyId}`);
  if (locationId) {
    revalidatePath(
      `/customers/companies/${companyId}/locations/${locationId}`,
    );
  }
}

// ── Read-only: picker-källa för huvudkontakt ────────────────────

/**
 * Söker gäster för kontaktpickaren i /customers/companies/new. Returnerar
 * namn och e-post separat så UI kan visa båda på varje rad.
 */
export async function searchGuestsForCompanyContact(
  query: string,
): Promise<Array<{ id: string; name: string; email: string }>> {
  const ctx = await requireContext();
  if (!ctx.ok) return [];
  const result = await listGuestAccounts(ctx.tenantId, { search: query, take: 20 });
  return result.guests.map((g) => ({
    id: g.id,
    name: [g.firstName, g.lastName].filter(Boolean).join(" ").trim(),
    email: g.email,
  }));
}

// ── Company writes ──────────────────────────────────────────────

export async function createCompanyAction(input: {
  name: string;
  externalId?: string;
  tags?: string[];
  note?: string;
  firstLocation: {
    name: string;
    billingAddress: Record<string, unknown>;
    shippingAddress?: Record<string, unknown>;
    externalId?: string;
  };
  mainContact:
    | { guestAccountId: string; title?: string; locale?: string }
    | {
        newGuestEmail: string;
        newGuestName: string;
        title?: string;
        locale?: string;
      };
}): Promise<ActionResult<{ companyId: string }>> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    const out = await createCompany({
      tenantId: ctx.tenantId,
      name: input.name,
      externalId: input.externalId,
      tags: input.tags,
      note: input.note,
      firstLocation: input.firstLocation,
      mainContact: input.mainContact,
    });
    await createCompanyEvent({
      tenantId: ctx.tenantId,
      companyId: out.company.id,
      type: "COMPANY_CREATED",
      message: "Företag skapat",
      actorUserId: ctx.staffUserId,
    });
    revalidateCompanyPaths(out.company.id);
    return { ok: true, data: { companyId: out.company.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCompanyAction(
  companyId: string,
  patch: {
    name?: string;
    externalId?: string | null;
    tags?: string[];
    note?: string | null;
    metafields?: unknown;
  },
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await updateCompany({ tenantId: ctx.tenantId, companyId, patch });
    await createCompanyEvent({
      tenantId: ctx.tenantId,
      companyId,
      type: "COMPANY_UPDATED",
      message: "Företagsuppgifter uppdaterade",
      actorUserId: ctx.staffUserId,
    });
    revalidateCompanyPaths(companyId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveCompanyAction(
  companyId: string,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await archiveCompany({ tenantId: ctx.tenantId, companyId });
    await createCompanyEvent({
      tenantId: ctx.tenantId,
      companyId,
      type: "COMPANY_ARCHIVED",
      message: "Företaget arkiverades",
      actorUserId: ctx.staffUserId,
    });
    revalidateCompanyPaths(companyId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function unarchiveCompanyAction(
  companyId: string,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await unarchiveCompany({ tenantId: ctx.tenantId, companyId });
    await createCompanyEvent({
      tenantId: ctx.tenantId,
      companyId,
      type: "COMPANY_UNARCHIVED",
      message: "Företaget återställdes",
      actorUserId: ctx.staffUserId,
    });
    revalidateCompanyPaths(companyId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function setMainContactAction(
  companyId: string,
  contactId: string,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await setMainContact({ tenantId: ctx.tenantId, companyId, contactId });
    await createCompanyEvent({
      tenantId: ctx.tenantId,
      companyId,
      type: "MAIN_CONTACT_SET",
      message: "Ny huvudkontakt",
      metadata: { contactId },
      actorUserId: ctx.staffUserId,
    });
    revalidateCompanyPaths(companyId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ── Comment (tidslinje) ───────────────────────────────────────

export async function addCompanyCommentAction(
  companyId: string,
  comment: string,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  const trimmed = comment.trim();
  if (!trimmed) return { ok: false, error: "Kommentaren kan inte vara tom" };
  if (trimmed.length > 2000) {
    return { ok: false, error: "Kommentaren är för lång (max 2000 tecken)" };
  }

  try {
    let authorName = "Personal";
    if (ctx.staffUserId) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server");
        const client = await clerkClient();
        const user = await client.users.getUser(ctx.staffUserId);
        authorName =
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.emailAddresses[0]?.emailAddress ||
          "Personal";
      } catch {
        // Dev eller Clerk otillgänglig — fallback.
      }
    }

    await createCompanyEvent({
      tenantId: ctx.tenantId,
      companyId,
      type: "COMMENT_ADDED",
      message: trimmed,
      metadata: { authorName },
      actorUserId: ctx.staffUserId,
    });

    revalidateCompanyPaths(companyId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ── Location writes ─────────────────────────────────────────────

export async function createLocationAction(input: {
  companyId: string;
  name: string;
  billingAddress: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  externalId?: string;
}): Promise<ActionResult<{ locationId: string }>> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    const out = await createLocation({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      name: input.name,
      billingAddress: input.billingAddress,
      shippingAddress: input.shippingAddress,
      externalId: input.externalId,
    });
    revalidateCompanyPaths(input.companyId, out.id);
    return { ok: true, data: { locationId: out.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateLocationAction(input: {
  companyId: string;
  locationId: string;
  patch: Parameters<typeof updateLocation>[0]["patch"];
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await updateLocation({
      tenantId: ctx.tenantId,
      locationId: input.locationId,
      patch: input.patch,
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLocationAction(input: {
  companyId: string;
  locationId: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await deleteLocation({ tenantId: ctx.tenantId, locationId: input.locationId });
    revalidateCompanyPaths(input.companyId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ── Contact writes (3-layer) ────────────────────────────────────

export async function createContactAction(input: {
  companyId: string;
  locationId: string;
  contact:
    | { guestAccountId: string }
    | { email: string; name: string };
  title?: string;
  locale?: string;
}): Promise<ActionResult<{ contactId: string }>> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    const contact = await createContact({
      tenantId: ctx.tenantId,
      companyId: input.companyId,
      contact: input.contact,
      title: input.title,
      locale: input.locale,
      // Grant access to the location the admin is editing — this covers the
      // "add contact to this location" ergonomic. Add more via grantAccessAction.
      grantAccessToLocationIds: [input.locationId],
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: { contactId: contact.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeContactAction(input: {
  companyId: string;
  contactId: string;
  locationId?: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await removeContact({ tenantId: ctx.tenantId, contactId: input.contactId });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function grantAccessAction(input: {
  companyId: string;
  locationId: string;
  contactId: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await grantAccess({
      tenantId: ctx.tenantId,
      companyContactId: input.contactId,
      companyLocationId: input.locationId,
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeAccessAction(input: {
  companyId: string;
  locationId: string;
  contactId: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await revokeAccess({
      tenantId: ctx.tenantId,
      companyContactId: input.contactId,
      companyLocationId: input.locationId,
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// ── Catalog assignment writes ───────────────────────────────────

export async function assignCatalogAction(input: {
  companyId: string;
  locationId: string;
  catalogId: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await assignCatalogToLocation({
      tenantId: ctx.tenantId,
      catalogId: input.catalogId,
      companyLocationId: input.locationId,
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function unassignCatalogAction(input: {
  companyId: string;
  locationId: string;
  catalogId: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await unassignCatalog({
      tenantId: ctx.tenantId,
      catalogId: input.catalogId,
      companyLocationId: input.locationId,
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export { addInclusion as _addInclusion_forFutureUse };

// ── Store credit ────────────────────────────────────────────────

export async function issueStoreCreditAction(input: {
  companyId: string;
  locationId: string;
  amountCents: string; // wire as string because BigInt does not JSON-serialize
  reason: StoreCreditReason;
  note?: string | null;
  expiresAt?: string | null; // ISO
}): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx.ok) return ctx;
  try {
    await issueCredit({
      tenantId: ctx.tenantId,
      locationId: input.locationId,
      amountCents: BigInt(input.amountCents),
      reason: input.reason,
      note: input.note ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdByStaffId: ctx.staffUserId,
    });
    revalidateCompanyPaths(input.companyId, input.locationId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}
