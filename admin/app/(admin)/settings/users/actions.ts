"use server";

import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin, resolveActingUserId } from "@/app/(admin)/_lib/auth/devAuth";
import { checkRateLimit } from "@/app/(admin)/_lib/auth/rate-limit";

// ── Types ──────────────────────────────────────────────────

export type UserStatus = "active" | "pending" | "revoked";

export type OrgUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  imageUrl: string;
  hasImage: boolean;
  role: string;
  roleName: string;
  status: UserStatus;
  joinedAt: string;
};

export type InviteEmailResult = {
  email: string;
  ok: boolean;
  error?: string;
};

export type InviteResult = {
  ok: boolean;
  error?: string;
  results?: InviteEmailResult[];
};

// ── getOrganisationUsers ───────────────────────────────────
// Readable by any org member — no admin guard needed.

export async function getOrganisationUsers(): Promise<OrgUser[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const { clerkOrgId } = tenantData;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();

    // Fetch active members and pending invitations in parallel
    const [memberships, invitations] = await Promise.all([
      client.organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId,
      }),
      client.organizations.getOrganizationInvitationList({
        organizationId: clerkOrgId,
        status: ["pending"],
      }),
    ]);

    // Map active members
    const activeUsers: OrgUser[] = memberships.data.map((m) => {
      const roleName =
        m.role === "org:admin" ? "Admin" : m.role === "org:member" ? "Medlem" : m.role;

      return {
        id: m.publicUserData?.userId ?? m.id,
        firstName: m.publicUserData?.firstName ?? null,
        lastName: m.publicUserData?.lastName ?? null,
        email: m.publicUserData?.identifier ?? "",
        imageUrl: m.publicUserData?.imageUrl ?? "",
        hasImage: m.publicUserData?.hasImage ?? false,
        role: m.role,
        roleName,
        status: "active" as UserStatus,
        joinedAt: new Date(m.createdAt).toISOString(),
      };
    });

    // Map pending invitations
    const pendingUsers: OrgUser[] = invitations.data.map((inv) => ({
      id: inv.id,
      firstName: null,
      lastName: null,
      email: inv.emailAddress,
      imageUrl: "",
      hasImage: false,
      role: inv.role ?? "org:member",
      roleName: inv.role === "org:admin" ? "Admin" : "Medlem",
      status: "pending" as UserStatus,
      joinedAt: new Date(inv.createdAt).toISOString(),
    }));

    return [...activeUsers, ...pendingUsers];
  } catch (error) {
    console.error("[getOrganisationUsers] Error:", error);
    return [];
  }
}

// ── inviteUsers ────────────────────────────────────────────

export async function inviteUsers(
  emails: string[],
  role: "org:admin" | "org:member",
): Promise<InviteResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  if (emails.length === 0) {
    return { ok: false, error: "Inga e-postadresser angivna" };
  }

  // Rate limit: max 20 invitations per org per hour
  if (!checkRateLimit(`${tenantData.clerkOrgId}:invite`)) {
    return { ok: false, error: "För många inbjudningar — vänta en stund innan du försöker igen" };
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();

    // In dev mode, clerkUserId is "dev_user" — resolveActingUserId substitutes
    // the real org owner from DEV_OWNER_USER_ID for Clerk API compatibility.
    const inviterUserId = resolveActingUserId(tenantData.clerkUserId);

    const settled = await Promise.allSettled(
      emails.map((email) =>
        client.organizations.createOrganizationInvitation({
          organizationId: tenantData.clerkOrgId,
          emailAddress: email.trim().toLowerCase(),
          role,
          inviterUserId,
        }),
      ),
    );

    // Map results back to per-email status
    const results: InviteEmailResult[] = settled.map((result, i) => {
      if (result.status === "fulfilled") {
        return { email: emails[i], ok: true };
      }
      const errMsg = extractClerkError(result.reason);
      return { email: emails[i], ok: false, error: errMsg };
    });

    const allFailed = results.every((r) => !r.ok);
    if (allFailed) {
      return { ok: false, error: "Ingen inbjudan kunde skickas", results };
    }

    return { ok: true, results };
  } catch (error) {
    console.error("[inviteUsers] Error:", error);
    return { ok: false, error: "Kunde inte skicka inbjudningarna — försök igen" };
  }
}

// ── changeUserRole ─────────────────────────────────────────

export async function changeUserRole(
  userId: string,
  newRole: "org:admin" | "org:member",
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.organizations.updateOrganizationMembership({
      organizationId: tenantData.clerkOrgId,
      userId,
      role: newRole,
    });
    return { ok: true };
  } catch (error) {
    console.error("[changeUserRole] Error:", error);
    return { ok: false, error: "Kunde inte ändra rollen — försök igen" };
  }
}

// ── removeUser ─────────────────────────────────────────────

export async function removeUser(
  userId: string,
  status: UserStatus,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();

    if (status === "pending") {
      // Revoke invitation by ID — resolveActingUserId provides a real Clerk
      // user ID since dev mode uses "dev_user" which Clerk rejects.
      await client.organizations.revokeOrganizationInvitation({
        organizationId: tenantData.clerkOrgId,
        invitationId: userId,
        requestingUserId: resolveActingUserId(tenantData.clerkUserId),
      });
    } else {
      // Remove active member
      await client.organizations.deleteOrganizationMembership({
        organizationId: tenantData.clerkOrgId,
        userId,
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[removeUser] Error:", error);
    return { ok: false, error: "Kunde inte ta bort användaren — försök igen" };
  }
}

// ── resendInvitation ───────────────────────────────────────
// Clerk SDK does not have a native resend method. We use a create-first
// approach: try creating a new invitation first, then revoke the old one.
// This avoids the race condition where revoking first could leave the
// user without any invitation if the create fails.

export async function resendInvitation(
  invitationId: string,
  email: string,
  role: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // Rate limit: shares the same bucket as inviteUsers
  if (!checkRateLimit(`${tenantData.clerkOrgId}:invite`)) {
    return { ok: false, error: "För många inbjudningar — vänta en stund" };
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();

    const actingUserId = resolveActingUserId(tenantData.clerkUserId);

    // Step 1: Revoke old invitation first (Clerk rejects duplicate pending invites)
    try {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: tenantData.clerkOrgId,
        invitationId,
        requestingUserId: actingUserId,
      });
    } catch (revokeErr) {
      // If revoke fails (already revoked/expired), log and continue —
      // the old invitation is no longer valid anyway
      console.warn("[resendInvitation] Revoke failed (continuing):", revokeErr);
    }

    // Step 2: Create new invitation
    await client.organizations.createOrganizationInvitation({
      organizationId: tenantData.clerkOrgId,
      emailAddress: email,
      role: role as "org:admin" | "org:member",
      inviterUserId: actingUserId,
    });

    return { ok: true };
  } catch (error) {
    console.error("[resendInvitation] Error:", error);
    return { ok: false, error: "Kunde inte skicka inbjudan igen — försök igen" };
  }
}

// ── Helpers ────────────────────────────────────────────────

function extractClerkError(err: unknown): string {
  if (err && typeof err === "object") {
    const clerkErr = err as { errors?: Array<{ message?: string; longMessage?: string }> };
    if (clerkErr.errors?.[0]?.longMessage) return clerkErr.errors[0].longMessage;
    if (clerkErr.errors?.[0]?.message) return clerkErr.errors[0].message;
    if ("message" in err && typeof (err as { message: string }).message === "string") {
      return (err as { message: string }).message;
    }
  }
  return "Okänt fel";
}
