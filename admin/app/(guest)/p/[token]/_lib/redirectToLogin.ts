/**
 * Redirect shim for deprecated /p/[token]/* routes.
 *
 * Looks up the tenant from the portalToken and redirects to their login page.
 * Old emails, bookmarks, and search engine indexes may still reference these URLs.
 * The /p/[token]/* routes are kept as permanent redirect shims — never deleted.
 */

import { redirect } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { portalSlugToUrl } from "@/app/_lib/tenant/portal-slug";

export async function redirectToTenantLogin(token: string): Promise<never> {
  const booking = await prisma.booking.findUnique({
    where: { portalToken: token },
    select: { tenant: { select: { portalSlug: true } } },
  });

  const slug = booking?.tenant?.portalSlug;
  const loginUrl = slug
    ? `${portalSlugToUrl(slug)}/login`
    : "/login";

  redirect(loginUrl);
}
