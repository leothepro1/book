"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin, resolveActingUserId } from "@/app/(admin)/_lib/auth/devAuth";
import { getPlatformBaseDomain } from "@/app/_lib/platform/constants";
import { getTenantUrl } from "@/app/_lib/tenant/tenant-url";
import { OrganisationFormSchema } from "./validation";
import type { OrganisationFormData } from "./validation";

// ── Response types ──────────────────────────────────────────

export type ClerkOrgData = {
  name: string;
  slug: string;
  logoUrl: string;
  membersCount: number;
  createdAt: string;
};

export type TenantOrgData = {
  legalName: string | null;
  businessType: string | null;
  nickname: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  organizationNumber: string | null;
  vatNumber: string | null;
  portalSlug: string | null;
  /** Pre-composed via getTenantUrl. Null when portalSlug is null. */
  portalUrl: string | null;
  /** Bare host for display (e.g. "hotel-x.rutgr.com"). Null when portalSlug is null. */
  portalHost: string | null;
};

export type OrgMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  imageUrl: string;
  role: string;
  joinedAt: string;
};

export type OrganisationDataResponse = {
  clerk: ClerkOrgData;
  tenant: TenantOrgData;
  members: OrgMember[];
} | null;

// ── getOrganisationData ─────────────────────────────────────
// Readable by any org member — no admin guard needed.

export async function getOrganisationData(): Promise<OrganisationDataResponse> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const { tenant, clerkOrgId } = tenantData;

  let members: OrgMember[] = [];

  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  const clerk: ClerkOrgData = {
    name: org.name,
    slug: org.slug ?? tenant.slug,
    logoUrl: org.imageUrl,
    membersCount: org.membersCount ?? 0,
    createdAt: new Date(org.createdAt).toISOString(),
  };

  try {
    const memberships = await client.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId,
    });
    members = memberships.data.map((m) => ({
      id: m.publicUserData?.userId ?? "",
      firstName: m.publicUserData?.firstName ?? null,
      lastName: m.publicUserData?.lastName ?? null,
      email: m.publicUserData?.identifier ?? "",
      imageUrl: m.publicUserData?.imageUrl ?? "",
      role: m.role === "org:admin" ? "Admin" : m.role === "org:member" ? "Medlem" : "Ägare",
      joinedAt: new Date(m.createdAt).toISOString(),
    }));
  } catch {
    // If member fetch fails, return empty — don't crash
  }

  const tenantOrg: TenantOrgData = {
    legalName: tenant.legalName,
    businessType: tenant.businessType,
    nickname: tenant.nickname,
    phone: tenant.phone,
    addressStreet: tenant.addressStreet,
    addressPostalCode: tenant.addressPostalCode,
    addressCity: tenant.addressCity,
    addressCountry: tenant.addressCountry,
    organizationNumber: tenant.organizationNumber,
    vatNumber: tenant.vatNumber,
    portalSlug: tenant.portalSlug,
    portalUrl: tenant.portalSlug ? getTenantUrl(tenant) : null,
    portalHost: tenant.portalSlug
      ? `${tenant.portalSlug}.${getPlatformBaseDomain()}`
      : null,
  };

  return { clerk, tenant: tenantOrg, members };
}

// ── updateOrganisationInfo ──────────────────────────────────

export async function updateOrganisationInfo(
  data: OrganisationFormData,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const parsed = OrganisationFormSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Ogiltiga uppgifter — kontrollera fälten" };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: parsed.data,
    });
    return { ok: true };
  } catch (error) {
    console.error("[updateOrganisationInfo] Error:", error);
    return { ok: false, error: "Kunde inte spara — försök igen" };
  }
}

// ── updateClerkOrgName ──────────────────────────────────────
// Writes to Clerk + local DB directly. The webhook will also update DB
// when it arrives, but the direct write gives immediate UI consistency.
// The webhook serves as a safety net for out-of-band changes (e.g. Clerk Dashboard).

export async function updateClerkOrgName(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) {
    return { ok: false, error: "Namnet måste vara mellan 1 och 100 tecken" };
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.organizations.updateOrganization(tenantData.clerkOrgId, {
      name: trimmed,
    });
    // Also sync name to local DB
    await prisma.tenant.update({
      where: { id: tenantData.tenant.id },
      data: { name: trimmed },
    });
    return { ok: true };
  } catch (error) {
    console.error("[updateClerkOrgName] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera organisationsnamnet" };
  }
}

// ── updateOrganisationImage ──────────────────────────────────

export async function updateOrganisationImage(
  imageUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  if (!imageUrl.trim()) {
    return { ok: false, error: "Ingen bild vald" };
  }

  try {
    // Download the image from Cloudinary and upload to Clerk
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { ok: false, error: "Kunde inte hämta bilden" };
    }
    const blob = await response.blob();
    const file = new File([blob], "organisation-logo.jpg", { type: blob.type });

    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    // In dev mode, clerkUserId is "dev_user" — resolveActingUserId substitutes
    // the real org owner from DEV_OWNER_USER_ID for Clerk API compatibility.
    const uploaderUserId = resolveActingUserId(tenantData.clerkUserId);
    await client.organizations.updateOrganizationLogo(tenantData.clerkOrgId, {
      file,
      uploaderUserId,
    });
    return { ok: true };
  } catch (error) {
    console.error("[updateOrganisationImage] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera bilden — försök igen" };
  }
}

// ── deleteOrganisationImage ─────────────────────────────────

export async function deleteOrganisationImage(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.organizations.deleteOrganizationLogo(tenantData.clerkOrgId);
    return { ok: true };
  } catch (error) {
    console.error("[deleteOrganisationImage] Error:", error);
    return { ok: false, error: "Kunde inte ta bort bilden — försök igen" };
  }
}

// ── Business Entities ───────────────────────────────────────

export type BusinessEntityData = {
  id: string;
  businessType: string;
  legalName: string;
  nickname: string | null;
  addressStreet: string | null;
  addressApartment: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  createdAt: string;
};

export async function getBusinessEntities(): Promise<BusinessEntityData[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const entities = await prisma.businessEntity.findMany({
    where: { tenantId: tenantData.tenant.id },
    orderBy: { createdAt: "desc" },
  });

  return entities.map((e) => ({
    id: e.id,
    businessType: e.businessType,
    legalName: e.legalName,
    nickname: e.nickname,
    addressStreet: e.addressStreet,
    addressApartment: e.addressApartment,
    addressPostalCode: e.addressPostalCode,
    addressCity: e.addressCity,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function createBusinessEntity(data: {
  businessType: string;
  legalName: string;
  nickname?: string;
  addressStreet?: string;
  addressApartment?: string;
  addressPostalCode?: string;
  addressCity?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  if (!data.legalName?.trim()) {
    return { ok: false, error: "Företagsnamn krävs" };
  }
  if (!data.businessType?.trim()) {
    return { ok: false, error: "Verksamhetstyp krävs" };
  }

  try {
    await prisma.businessEntity.create({
      data: {
        tenantId: tenantData.tenant.id,
        businessType: data.businessType,
        legalName: data.legalName.trim(),
        nickname: data.nickname?.trim() || null,
        addressStreet: data.addressStreet?.trim() || null,
        addressApartment: data.addressApartment?.trim() || null,
        addressPostalCode: data.addressPostalCode?.trim() || null,
        addressCity: data.addressCity?.trim() || null,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("[createBusinessEntity] Error:", error);
    return { ok: false, error: "Kunde inte skapa företagsenheten — försök igen" };
  }
}

export async function updateBusinessEntity(
  entityId: string,
  data: {
    businessType: string;
    legalName: string;
    nickname?: string;
    addressStreet?: string;
    addressApartment?: string;
    addressPostalCode?: string;
    addressCity?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  if (!data.legalName?.trim()) {
    return { ok: false, error: "Företagsnamn krävs" };
  }

  try {
    // Verify ownership
    const existing = await prisma.businessEntity.findFirst({
      where: { id: entityId, tenantId: tenantData.tenant.id },
    });
    if (!existing) return { ok: false, error: "Företagsenheten hittades inte" };

    await prisma.businessEntity.update({
      where: { id: entityId },
      data: {
        businessType: data.businessType,
        legalName: data.legalName.trim(),
        nickname: data.nickname?.trim() || null,
        addressStreet: data.addressStreet?.trim() || null,
        addressApartment: data.addressApartment?.trim() || null,
        addressPostalCode: data.addressPostalCode?.trim() || null,
        addressCity: data.addressCity?.trim() || null,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("[updateBusinessEntity] Error:", error);
    return { ok: false, error: "Kunde inte uppdatera företagsenheten — försök igen" };
  }
}

export async function deleteBusinessEntity(
  entityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  try {
    await prisma.businessEntity.deleteMany({
      where: { id: entityId, tenantId: tenantData.tenant.id },
    });
    return { ok: true };
  } catch (error) {
    console.error("[deleteBusinessEntity] Error:", error);
    return { ok: false, error: "Kunde inte ta bort företagsenheten" };
  }
}
