import { env } from "@/app/_lib/env";

const IS_DEV = process.env.NODE_ENV === "development";

import { ADMIN_ROLE } from "./roles";
export { ADMIN_ROLE };

type AuthResult = {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
};

/**
 * Returns userId/orgId/orgRole — in dev mode returns values from env,
 * in production delegates to Clerk's auth().
 */
export async function getAuth(): Promise<AuthResult> {
  if (IS_DEV) {
    return { userId: "dev_user", orgId: env.DEV_ORG_ID!, orgRole: ADMIN_ROLE };
  }

  const { auth } = await import("@clerk/nextjs/server");
  const session = await auth();
  return {
    userId: session.userId,
    orgId: session.orgId ?? null,
    orgRole: session.orgRole ?? null,
  };
}

/**
 * Checks that the current user has org:admin role.
 * Returns an error result suitable for server action returns if not.
 */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgRole } = await getAuth();
  if (orgRole !== ADMIN_ROLE) {
    return { ok: false, error: "Du har inte behörighet att utföra denna åtgärd" };
  }
  return { ok: true };
}

/**
 * Resolves the acting user ID for Clerk API calls.
 * In dev mode, the session user is "dev_user" which is not a real Clerk user,
 * so we substitute the real org owner from DEV_OWNER_USER_ID.
 */
export function resolveActingUserId(clerkUserId: string): string {
  if (IS_DEV && clerkUserId === "dev_user") {
    const devId = env.DEV_OWNER_USER_ID;
    if (!devId) {
      throw new Error("[auth] DEV_OWNER_USER_ID is required in development for Clerk API calls");
    }
    return devId;
  }
  return clerkUserId;
}
