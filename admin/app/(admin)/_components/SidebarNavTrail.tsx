'use client';

import { useLinkStatus } from 'next/link';

/**
 * Trailing slot for a sidebar `<Link>`. Swaps to a spinner while the
 * route transition initiated by that link is pending, otherwise renders
 * `defaultIcon` (or nothing). Must be rendered as a descendant of `<Link>`
 * — `useLinkStatus` reads from the link's transition context.
 *
 * Pairs with the pathname-driven auto-sync in `SidebarNavContext`: the
 * drill-in panel only swaps when the new route commits, so the spinner
 * is the sole signal that the click registered while the page is loading.
 */
export function SidebarNavTrail({ defaultIcon }: { defaultIcon?: string }) {
  const { pending } = useLinkStatus();

  if (pending) {
    return (
      <span className="material-symbols-rounded sb__item-pending" aria-hidden>
        progress_activity
      </span>
    );
  }

  if (defaultIcon) {
    return (
      <span className="material-symbols-rounded sb__item-trail">{defaultIcon}</span>
    );
  }

  return null;
}
