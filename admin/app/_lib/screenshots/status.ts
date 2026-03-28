"use server";

import { prisma } from "@/app/_lib/db/prisma";

export interface ScreenshotStatus {
  desktopUrl: string | null;
  mobileUrl: string | null;
  hash: string | null;
  pending: boolean;
  updatedAt: string | null;
}

export async function getScreenshotStatus(tenantId: string): Promise<ScreenshotStatus> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      screenshotDesktopUrl: true,
      screenshotMobileUrl: true,
      screenshotHash: true,
      screenshotPending: true,
      screenshotUpdatedAt: true,
    },
  });

  if (!tenant) {
    return { desktopUrl: null, mobileUrl: null, hash: null, pending: false, updatedAt: null };
  }

  return {
    desktopUrl: tenant.screenshotDesktopUrl,
    mobileUrl: tenant.screenshotMobileUrl,
    hash: tenant.screenshotHash,
    pending: tenant.screenshotPending,
    updatedAt: tenant.screenshotUpdatedAt?.toISOString() ?? null,
  };
}
