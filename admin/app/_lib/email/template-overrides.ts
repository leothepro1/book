/**
 * Template Override Resolution
 * ════════════════════════════
 *
 * resolveTemplateHtml() is the single source of truth for choosing
 * between a tenant's custom HTML and the platform default.
 *
 * Branding injection (logo, accent color) applies ONLY to platform
 * default templates. If a tenant has a custom HTML override, it is
 * sent exactly as stored — they own that HTML fully.
 */

import type { EmailEventType } from "./registry";

export function resolveTemplateHtml(
  eventType: EmailEventType,
  overrideHtml: string | null | undefined,
  defaultHtml: string,
): { html: string; isOverride: boolean } {
  if (overrideHtml && overrideHtml.trim().length > 0) {
    return { html: overrideHtml, isOverride: true };
  }
  return { html: defaultHtml, isOverride: false };
}
