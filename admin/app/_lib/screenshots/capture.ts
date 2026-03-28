/**
 * Screenshot Capture — Playwright headless Chromium.
 *
 * capturePortalScreenshots() is the ONLY function that launches a browser.
 * Desktop: 1440×900, Mobile: 390×844.
 * Always closes the browser — even on error.
 */

import { chromium } from "playwright";
import { log } from "@/app/_lib/logger";

export interface CaptureResult {
  desktopBuffer: Buffer;
  mobileBuffer: Buffer;
}

export async function capturePortalScreenshots(
  portalUrl: string,
  tenantId: string,
): Promise<CaptureResult> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    // ── Desktop (1440×900) ──────────────────────────────────
    const desktopPage = await browser.newPage();
    await desktopPage.setViewportSize({ width: 1440, height: 900 });
    await desktopPage.goto(portalUrl, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await desktopPage.addStyleTag({
      content: "[data-admin-only], .preview-bar { display: none !important; }",
    });
    await desktopPage.waitForTimeout(500);
    const desktopBuffer = await desktopPage.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });

    // ── Mobile (390×844) ────────────────────────────────────
    const mobilePage = await browser.newPage();
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobilePage.goto(portalUrl, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await mobilePage.addStyleTag({
      content: "[data-admin-only], .preview-bar { display: none !important; }",
    });
    await mobilePage.waitForTimeout(500);
    const mobileBuffer = await mobilePage.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 390, height: 844 },
    });

    log("info", "screenshot.captured", { tenantId });

    return {
      desktopBuffer: Buffer.from(desktopBuffer),
      mobileBuffer: Buffer.from(mobileBuffer),
    };
  } catch (err) {
    log("error", "screenshot.capture_failed", {
      tenantId,
      url: portalUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    await browser.close();
  }
}
