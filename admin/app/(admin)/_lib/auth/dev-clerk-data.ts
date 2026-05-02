import "server-only";
import { env } from "@/app/_lib/env";

const IS_DEV = process.env.NODE_ENV === "development";

export type DevClerkUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  emailAddress: string | null;
  imageUrl: string;
};

export type DevClerkOrg = {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string;
};

export type DevClerkData = {
  user: DevClerkUser;
  org: DevClerkOrg;
};

// Cache the result per (userId, orgId) pair for the lifetime of the
// dev process. The result is either a successful DevClerkData or a
// "not_found" sentinel. Both are terminal — we never retry the same
// pair, which prevents the dev console from spamming a stack trace
// on every page load when the env points at a Clerk org/user that
// doesn't exist (a routine state when switching between Clerk
// instances or working from a freshly seeded DB).
//
// The cache resets on dev-server restart, which is when the env is
// re-read anyway. So the contract for the operator is: if you fix
// DEV_ORG_ID / DEV_OWNER_USER_ID, restart the server.
type CacheEntry = { kind: "ok"; data: DevClerkData } | { kind: "not_found" };
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, orgId: string): string {
  return `${userId}::${orgId}`;
}

/**
 * In dev, fetches the real Clerk org + user via DEV_ORG_ID + DEV_OWNER_USER_ID.
 * Returns null in prod (Clerk hooks are used directly there) or when Clerk
 * has no record of the configured user/org.
 *
 * Robust: caches both success and "known-not-found" per (userId, orgId)
 * pair. A wrong env value logs once (with a clear remediation hint) and
 * never re-hits Clerk for that pair.
 */
export async function loadDevClerkData(): Promise<DevClerkData | null> {
  if (!IS_DEV) return null;
  if (!env.DEV_ORG_ID || !env.DEV_OWNER_USER_ID) return null;

  const key = cacheKey(env.DEV_OWNER_USER_ID, env.DEV_ORG_ID);
  const cached = cache.get(key);
  if (cached) {
    return cached.kind === "ok" ? cached.data : null;
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const [user, org] = await Promise.all([
      client.users.getUser(env.DEV_OWNER_USER_ID),
      client.organizations.getOrganization({ organizationId: env.DEV_ORG_ID }),
    ]);

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

    const data: DevClerkData = {
      user: {
        id: user.id,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        fullName,
        username: user.username ?? null,
        emailAddress: user.emailAddresses[0]?.emailAddress ?? null,
        imageUrl: user.imageUrl ?? "",
      },
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug ?? null,
        imageUrl: org.imageUrl ?? "",
      },
    };
    cache.set(key, { kind: "ok", data });
    return data;
  } catch (error) {
    cache.set(key, { kind: "not_found" });
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: unknown }).status
        : undefined;
    if (status === 404) {
      // Single-line, no stack trace. The stack adds nothing — the
      // operator just needs to know which env value is wrong.
      console.warn(
        `[dev-clerk-data] Clerk has no record of DEV_OWNER_USER_ID=${env.DEV_OWNER_USER_ID} or DEV_ORG_ID=${env.DEV_ORG_ID}. UI degrades to env-derived placeholders. Restart dev server after fixing .env.`,
      );
    } else {
      console.warn(
        `[dev-clerk-data] Failed to fetch Clerk data in dev (will not retry until restart):`,
        error instanceof Error ? error.message : String(error),
      );
    }
    return null;
  }
}

/**
 * Test-only — clears the in-process cache so a fresh fetch attempt
 * runs on the next call. Production code never invokes this.
 */
export function _resetDevClerkDataCacheForTests(): void {
  cache.clear();
}
