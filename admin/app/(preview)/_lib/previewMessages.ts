import type { ThemeConfig } from "@/app/(guest)/_lib/theme/types";

/**
 * Messages sent from admin parent window → preview iframe.
 *
 * Protocol:
 *  1. iframe mounts PreviewBridge → sends "preview-ready"
 *  2. Parent receives ready → sends current config as initial "theme-update"
 *  3. On every optimistic config change → "theme-update" (instant CSS vars)
 *  4. After updateDraft persists to DB → "content-refresh" (router.refresh)
 *  5. On editor selection change → "scroll-to-target" (smooth scroll + highlight)
 */

/**
 * Identifies a target in the preview DOM.
 * Always includes sectionId; blockId/elementId add specificity.
 * The scroll controller uses the MOST specific ID available.
 */
export type PreviewScrollTarget = {
  sectionId: string;
  blockId?: string;
  elementId?: string;
};

export type ParentToPreviewMessage =
  | { type: "theme-update"; theme: ThemeConfig }
  | { type: "content-refresh" }
  | { type: "scroll-to-target"; target: PreviewScrollTarget };

export type PreviewToParentMessage =
  | { type: "preview-ready" };

export type PreviewMessage = ParentToPreviewMessage | PreviewToParentMessage;

const VALID_TYPES = ["theme-update", "content-refresh", "preview-ready", "scroll-to-target"];

/** Origin check — same origin for preview iframe */
export function isValidPreviewMessage(
  event: MessageEvent,
): event is MessageEvent<PreviewMessage> {
  if (event.origin !== window.location.origin) return false;
  const data = event.data;
  if (!data || typeof data !== "object" || typeof data.type !== "string") return false;
  return VALID_TYPES.includes(data.type);
}
