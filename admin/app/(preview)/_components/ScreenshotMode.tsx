"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Applies screenshot-mode class to <html> when ?_screenshot=1 is present.
 * Hides chat widgets, cookie banners, and other overlay elements
 * that shouldn't appear in automated screenshots.
 */
export function ScreenshotMode() {
  const params = useSearchParams();
  const isScreenshot = params.get("_screenshot") === "1";

  useEffect(() => {
    if (isScreenshot) {
      document.documentElement.classList.add("screenshot-mode");
    }
    return () => {
      document.documentElement.classList.remove("screenshot-mode");
    };
  }, [isScreenshot]);

  return null;
}
