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
 *  6. Inspector mode → "inspector-mode" (enable/disable section inspector overlay)
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

/** Metadata for a section, sent to the iframe for inspector overlay labels. */
export type InspectorSectionMeta = {
  id: string;
  name: string;
  icon: string;
};

export type ParentToPreviewMessage =
  | { type: "theme-update"; theme: ThemeConfig }
  | { type: "content-refresh" }
  | { type: "scroll-to-target"; target: PreviewScrollTarget }
  | { type: "inspector-mode"; active: boolean; sections: InspectorSectionMeta[] }
  | { type: "checkin-step"; stepId: string }
  | { type: "wallet-card-update"; design: import("@/app/_lib/access-pass/card-design").CardDesignConfig };

export type PreviewToParentMessage =
  | { type: "preview-ready" }
  | { type: "inspector-hover"; sectionId: string | null }
  | { type: "inspector-click"; sectionId: string };

export type PreviewMessage = ParentToPreviewMessage | PreviewToParentMessage;

const VALID_TYPES = [
  "theme-update", "content-refresh", "preview-ready",
  "scroll-to-target", "inspector-mode",
  "inspector-hover", "inspector-click",
  "checkin-step",
  "wallet-card-update",
];

/** Origin check — same origin for preview iframe */
export function isValidPreviewMessage(
  event: MessageEvent,
): event is MessageEvent<PreviewMessage> {
  if (event.origin !== window.location.origin) return false;
  const data = event.data;
  if (!data || typeof data !== "object" || typeof data.type !== "string") return false;
  return VALID_TYPES.includes(data.type);
}
