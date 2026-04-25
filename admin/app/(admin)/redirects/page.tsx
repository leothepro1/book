import { redirect } from "next/navigation";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "../_lib/tenant/getCurrentTenant";

import RedirectsClient from "./_components/RedirectsClient";

export const dynamic = "force-dynamic";

export default async function RedirectsPage() {
  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    redirect("/");
  }

  const rows = await prisma.seoRedirect.findMany({
    where: { tenantId: tenantData.tenant.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fromPath: true,
      toPath: true,
      statusCode: true,
      hitCount: true,
      lastHitAt: true,
      createdAt: true,
    },
  });

  const initialRedirects = rows.map((r) => ({
    id: r.id,
    fromPath: r.fromPath,
    toPath: r.toPath,
    statusCode: r.statusCode,
    hitCount: r.hitCount,
    lastHitAt: r.lastHitAt ? r.lastHitAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return <RedirectsClient initialRedirects={initialRedirects} />;
}
