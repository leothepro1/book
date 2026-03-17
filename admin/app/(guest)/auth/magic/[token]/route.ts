import { NextResponse } from "next/server";
import { validateMagicLink } from "@/app/_lib/magic-link/validate";
import { setGuestSession } from "@/app/_lib/magic-link/session";

export const dynamic = "force-dynamic";

/**
 * Magic link callback — validates token, creates session, redirects.
 *
 * This is a route handler (not a page) because it sets a cookie
 * then redirects — no UI rendering needed.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const result = await validateMagicLink(token);

  if (!result.valid) {
    const reasonMap = {
      not_found: "invalid",
      expired: "expired",
      used: "used",
    } as const;
    return NextResponse.redirect(
      `${baseUrl}/auth/error?reason=${reasonMap[result.reason]}`,
    );
  }

  // Set guest session cookie
  await setGuestSession({
    tenantId: result.tenantId,
    email: result.email,
    authenticatedAt: Date.now(),
  });

  // Redirect to the guest portal root.
  // The guest is now authenticated via session cookie — portal pages
  // can use getGuestSession() to identify the guest and look up bookings.
  return NextResponse.redirect(`${baseUrl}/`);
}
