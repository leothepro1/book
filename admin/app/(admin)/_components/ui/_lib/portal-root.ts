/**
 * Resolve the portal anchor for admin popovers (Menu, Calendar,
 * Modal, Toast). Targets `<div id="admin-portal-root" />` rendered
 * inside admin layout's typography + Geist wrapper, so portaled
 * content inherits --admin-font + --font-geist-sans correctly.
 *
 * Falls back to document.body when the anchor is missing — outside
 * the admin layout (e.g. tests, storybook, guest accidentally
 * mounting an admin component) the popover still renders, just
 * without the Geist scope. This keeps the components usable in
 * isolation while making the right thing happen by default.
 */
export function getAdminPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('admin-portal-root') ?? document.body;
}
