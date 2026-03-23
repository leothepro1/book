import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * Layout for /p/[token]/* — publicly accessible booking engine pages.
 *
 * All tokens (including preview/test) pass through directly.
 * No authentication or session required.
 */
export default async function TokenPortalLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  return <>{children}</>;
}
