export const dynamic = "force-dynamic";

/**
 * Internal route — SEO redirect lookup by (tenantId, path, locale).
 * ═════════════════════════════════════════════════════════════════
 *
 * Called from middleware on every request whose path matches the
 * redirectable-prefix fast-filter. Edge runtime can't run Prisma
 * directly, so this Node.js route handles the one DB read.
 *
 * Secured with `x-cron-secret`. Not tenant-facing.
 *
 * The caller hits the same `normalizeRedirectPath` helper we use
 * on the write path (`collapseAndCreate`), so lookup is
 * byte-for-byte symmetric with storage.
 */

import { NextResponse } from "next/server";

import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { normalizeRedirectPath } from "@/app/_lib/seo/redirects/paths";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const tenantId = params.get("tenantId");
  const rawPath = params.get("path");
  const locale = params.get("locale");

  if (!tenantId || !rawPath || !locale) {
    return NextResponse.json(
      { error: "Missing tenantId, path, or locale" },
      { status: 400 },
    );
  }

  const normalizedPath = normalizeRedirectPath(rawPath);

  const redirect = await prisma.seoRedirect.findUnique({
    where: {
      tenantId_fromPath_locale: {
        tenantId,
        fromPath: normalizedPath,
        locale,
      },
    },
    select: {
      id: true,
      toPath: true,
      statusCode: true,
    },
  });

  return NextResponse.json({ redirect: redirect ?? null });
}
