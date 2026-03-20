import type { ReactNode } from "react";
import { redirectToTenantLogin } from "./_lib/redirectToLogin";

export const dynamic = "force-dynamic";

/**
 * Layout for /p/[token]/* — redirect shim for deprecated token-based URLs.
 *
 * Real tokens redirect to the tenant login page. Preview/test tokens
 * pass through so the editor canvas can render preview content.
 *
 * This layout runs before every sub-page under /p/[token]/, so individual
 * pages (help-center, support) don't need their own redirect logic.
 */
export default async function TokenPortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const isPreview = token === "preview" || token === "test";

  if (!isPreview) {
    await redirectToTenantLogin(token);
  }

  return <>{children}</>;
}
