import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { lookupMagicLinkTenant } from "@/app/_lib/magic-link/validate";
import { portalSlugToUrl } from "@/app/_lib/tenant/portal-slug";

export const dynamic = "force-dynamic";

/**
 * Legacy magic link callback — redirect shim.
 *
 * Existing magic links in already-sent emails point to /auth/magic/{token}
 * on rutgr.com. This route looks up which tenant the token belongs to
 * and redirects to the tenant subdomain login page with the token as a
 * query param: https://{portalSlug}.rutgr.com/login?ml={token}
 *
 * The /login page on the subdomain validates and consumes the token.
 * This shim does NOT mark the token as used — only reads tenantId.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Look up tenant without consuming the token
  const lookup = await lookupMagicLinkTenant(token);

  if (!lookup) {
    // Token is invalid, expired, or already used — show error page
    return NextResponse.redirect(`${baseUrl}/auth/error?reason=invalid`);
  }

  // Find tenant's portal slug for subdomain redirect
  const tenant = await prisma.tenant.findUnique({
    where: { id: lookup.tenantId },
    select: { portalSlug: true },
  });

  if (tenant?.portalSlug) {
    const portalBase = portalSlugToUrl(tenant.portalSlug);
    return NextResponse.redirect(`${portalBase}/login?ml=${token}`);
  }

  // Dev fallback: no portalSlug — redirect to same-origin /login
  return NextResponse.redirect(`${baseUrl}/login?ml=${token}`);
}
