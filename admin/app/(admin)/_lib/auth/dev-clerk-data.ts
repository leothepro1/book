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

/**
 * In dev, fetches the real Clerk org + user via DEV_ORG_ID + DEV_OWNER_USER_ID.
 * Returns null in prod (Clerk hooks are used directly there).
 *
 * Failures are swallowed — dev UI degrades gracefully if Clerk is unreachable.
 */
export async function loadDevClerkData(): Promise<DevClerkData | null> {
  if (!IS_DEV) return null;
  if (!env.DEV_ORG_ID || !env.DEV_OWNER_USER_ID) return null;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const [user, org] = await Promise.all([
      client.users.getUser(env.DEV_OWNER_USER_ID),
      client.organizations.getOrganization({ organizationId: env.DEV_ORG_ID }),
    ]);

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

    return {
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
  } catch (error) {
    console.error("[loadDevClerkData] Failed to fetch real Clerk data in dev:", error);
    return null;
  }
}
