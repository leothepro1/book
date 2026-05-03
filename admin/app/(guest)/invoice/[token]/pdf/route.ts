/**
 * Customer-facing invoice PDF download (FAS 7.9).
 *
 * URL: {portalSlug}.rutgr.com/invoice/{shareLinkToken}/pdf
 *
 * Mirrors the auth surface of `/invoice/[token]` (FAS 7.3) verbatim —
 * `resolveTenantFromHost()` for the subdomain and
 * `getDraftByShareToken()` for the share-link contract. No new auth
 * code; no admin path in V1 (Q8).
 *
 * Status gates (mirror the page handler):
 *   - tenant unresolved              → 404
 *   - draft not found / cross-tenant → 404
 *   - expired AND status ∈ INVOICED/OVERDUE → 410 Gone
 *   - status PAID/COMPLETED          → 200, even if shareLinkExpiresAt elapsed
 *                                       (informational PDF survives expiry)
 *
 * Response headers:
 *   - Content-Type: application/pdf
 *   - Content-Disposition: inline; filename="Faktura-<displayNumber>.pdf"
 *   - Cache-Control: private, no-cache, no-store, must-revalidate (Q3)
 *   - X-Robots-Tag: noindex, nofollow — invoice URLs must NEVER be indexed
 */

import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import {
  getDraftByShareToken,
  renderInvoicePdf,
} from "@/app/_lib/draft-orders";
import { prisma } from "@/app/_lib/db/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(
  _req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { token } = await ctx.params;

  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return new Response("Not found", { status: 404 });
  }

  const result = await getDraftByShareToken(token, tenant.id);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  // 410 Gone when the share link has expired AND the draft is still
  // awaiting payment. PAID / COMPLETED stay 200 — once a draft is
  // settled the PDF is informational (archive, expense reports) and
  // must remain accessible.
  if (
    result.expired &&
    result.draft.status !== "PAID" &&
    result.draft.status !== "COMPLETED"
  ) {
    return new Response("Gone", { status: 410 });
  }

  const tenantData = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { name: true, settings: true },
  });

  const pdf = await renderInvoicePdf({
    draft: result.draft,
    tenantName: tenantData?.name ?? "",
    tenantAddress: extractAddress(tenantData?.settings),
    brandColor: extractBrandColor(tenantData?.settings),
  });

  const filename = `Faktura-${result.draft.displayNumber}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function extractAddress(settings: unknown): string | undefined {
  if (settings === null || typeof settings !== "object") return undefined;
  const property = (settings as Record<string, unknown>).property;
  if (property === null || typeof property !== "object") return undefined;
  const address = (property as Record<string, unknown>).address;
  return typeof address === "string" && address.length > 0
    ? address
    : undefined;
}

function extractBrandColor(settings: unknown): string | undefined {
  if (settings === null || typeof settings !== "object") return undefined;
  const theme = (settings as Record<string, unknown>).theme;
  if (theme === null || typeof theme !== "object") return undefined;
  const colors = (theme as Record<string, unknown>).colors;
  if (colors === null || typeof colors !== "object") return undefined;
  const buttonBg = (colors as Record<string, unknown>).buttonBg;
  return typeof buttonBg === "string" && buttonBg.length > 0
    ? buttonBg
    : undefined;
}
