'use client';

import {
  forwardRef,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import './Tabs.css';

/**
 * Tabs — horizontal navigation primitive.
 *
 * Renders a `role="tablist"` with a `role="tab"` button per item. The
 * primitive owns the tab bar only — content panels are the consumer's
 * responsibility (they conditionally render based on `value`). For
 * full APG compliance the consumer wires `aria-controls` /
 * `aria-labelledby` between this list and their panels using the
 * tab `id` (`ui-tab-<itemId>`).
 *
 * Keyboard (WAI-ARIA APG, automatic activation):
 *   ←     previous (wraps)
 *   →     next (wraps)
 *   Home  first
 *   End   last
 * Disabled items are skipped during keyboard nav. Only the selected
 * tab is in the tab order; arrow keys move focus + activate among
 * siblings.
 *
 * Visual: items sit on a horizontal row separated by a 24px gap. The
 * tablist has a 1px gray rule along its bottom; the active tab has
 * a 2px dark border that overlaps that rule via `margin-bottom: -1px`,
 * so the dark indicator visually replaces the gray at that segment.
 */

export type TabItem = {
  id: string;
  label: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Required for screen readers when the tablist isn't already
      labelled by a sibling heading. */
  'aria-label'?: string;
  /** Alternative to aria-label — id of an external label element. */
  'aria-labelledby'?: string;
};

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    items,
    value,
    onChange,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  },
  ref,
) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const enabled = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;

    const currentEnabled = enabled.findIndex(({ item }) => item.id === value);
    let nextEnabled = currentEnabled;

    switch (e.key) {
      case 'ArrowRight':
        nextEnabled =
          (Math.max(currentEnabled, 0) + 1) % enabled.length;
        break;
      case 'ArrowLeft':
        nextEnabled =
          (Math.max(currentEnabled, 0) - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        nextEnabled = 0;
        break;
      case 'End':
        nextEnabled = enabled.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const next = enabled[nextEnabled];
    onChange(next.item.id);
    tabRefs.current[next.index]?.focus();
  }

  const cls = ['ui-tabs', className].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      role="tablist"
      className={cls}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        const tabCls = [
          'ui-tabs__tab',
          selected && 'ui-tabs__tab--selected',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={item.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`ui-tab-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className={tabCls}
            onClick={() => {
              if (item.disabled) return;
              onChange(item.id);
            }}
            onKeyDown={handleKeyDown}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
});

Tabs.displayName = 'Tabs';
