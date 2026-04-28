'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Sidebar drill-in transition.
 *
 * On `sectionKey` change, snapshots the previous children and renders both
 * the old (exiting) and new (entering) panes during a ~320ms slide.
 * Direction is inferred from the destination key — `"main"` is the back stop.
 *
 * Apple/iOS style:
 *   - Forward (entering a section):
 *       outgoing pane parallaxes 30% to the left, fades out
 *       incoming pane slides in from the right (100% → 0)
 *   - Back (exiting to main):
 *       outgoing pane slides off to the right (0 → 100%)
 *       incoming pane comes from a 30% left parallax position, fades in
 *
 * Easing: `cubic-bezier(0.32, 0.72, 0, 1)` — Apple's standard "spring".
 */

const DURATION_MS = 220;

type Snapshot = { key: string; node: ReactNode };

export function SidebarNavSwap({
  sectionKey,
  children,
}: {
  /** Unique id for the active pane. Use `"main"` for the default sidebar. */
  sectionKey: string;
  children: ReactNode;
}) {
  const [exiting, setExiting] = useState<Snapshot | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  // trackedKey/trackedNode mirror the most recently committed pane —
  // used to capture the about-to-leave tree at the exact moment the key
  // changes. Updated via render-phase setState (allowed when guarded by
  // a state-vs-prop comparison).
  const [trackedKey, setTrackedKey] = useState(sectionKey);
  const [trackedNode, setTrackedNode] = useState<ReactNode>(children);

  if (sectionKey !== trackedKey) {
    setExiting({ key: trackedKey, node: trackedNode });
    setDirection(sectionKey === 'main' ? 'back' : 'forward');
    setTrackedKey(sectionKey);
    setTrackedNode(children);
  }

  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => setExiting(null), DURATION_MS);
    return () => clearTimeout(t);
  }, [exiting]);

  return (
    <div className={`sb__swap sb__swap--${direction}`}>
      {exiting && (
        <div key={`exit-${exiting.key}`} className="sb__swap-pane sb__swap-pane--exit" aria-hidden>
          {exiting.node}
        </div>
      )}
      <div key={`enter-${sectionKey}`} className="sb__swap-pane sb__swap-pane--enter">
        {children}
      </div>
    </div>
  );
}
