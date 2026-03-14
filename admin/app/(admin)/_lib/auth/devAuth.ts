import { env } from "@/app/_lib/env";

/**
 * Returns userId/orgId — in dev mode returns values from env,
 * in production delegates to Clerk's auth().
 */
export async function getAuth(): Promise<{ userId: string | null; orgId: string | null }> {
  if (process.env.NODE_ENV === "development") {
    return { userId: "dev_user", orgId: env.DEV_ORG_ID! };
  }

  const { auth } = await import("@clerk/nextjs/server");
  const session = await auth();
  return { userId: session.userId, orgId: session.orgId ?? null };
}
