/**
 * Screenshot Orchestrator — single entry point.
 *
 * generateTenantScreenshots() is the ONLY function external code should call.
 * Sequence: validate → capture → upload → update DB.
 * screenshotPending stays true on failure → cron retries.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { capturePortalScreenshots } from "./capture";
import { uploadScreenshots } from "./upload";
import { log } from "@/app/_lib/logger";

export async function generateTenantScreenshots(
  tenantId: string,
): Promise<void> {
  // 1. Fetch tenant
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      portalSlug: true,
      screenshotHash: true,
      screenshotPending: true,
      settings: true,
    },
  });

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  // 2. Check if still relevant
  if (!tenant.screenshotPending) return;

  const baseUrl = process.env.SCREENSHOT_BASE_URL;
  if (!baseUrl) {
    log("warn", "screenshot.base_url_missing", { tenantId });
    return;
  }

  // 3. Build preview URL — published settings, no preview bar
  const portalBase = tenant.portalSlug
    ? `${baseUrl.replace(/\/$/, "")}`
    : baseUrl;

  const previewUrl = `${portalBase}/preview/home?draft=0&pb=0&_screenshot=1`;

  // 4. Capture
  const { desktopBuffer, mobileBuffer } = await capturePortalScreenshots(
    previewUrl,
    tenantId,
  );

  // 5. Upload to Cloudinary
  const { desktopUrl, mobileUrl } = await uploadScreenshots(
    tenantId,
    tenant.slug,
    desktopBuffer,
    mobileBuffer,
    tenant.screenshotHash ?? "unknown",
  );

  // 6. Update DB — mark as complete
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      screenshotDesktopUrl: desktopUrl,
      screenshotMobileUrl: mobileUrl,
      screenshotUpdatedAt: new Date(),
      screenshotPending: false,
    },
  });

  log("info", "screenshot.generated", { tenantId, desktopUrl, mobileUrl });
}
