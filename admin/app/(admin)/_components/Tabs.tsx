"use client";

// TODO: When primitives move to a shared location (see Modal.tsx), colocate
// Tabs with the rest. No shared util is extracted yet — the keyboard-nav
// logic is small enough to live here without duplication.

/**
 * Tabs — generic, accessible tab list primitive.
 *
 * Supports two shapes of tab:
 *   - Button tabs (no `href`): state-driven. Click / arrow keys auto-activate
 *     by firing `onChange(tab.id)`. The parent owns activeTabId; the component
 *     is fully controlled.
 *   - Link tabs (with `href`): URL-driven. Rendered as Next.js `<Link>` so
 *     Next handles prefetch + client-side routing. Arrow keys move focus
 *     only (manual activation) — user presses Enter to navigate. If
 *     `onChange` is provided in link mode, it is called on click for analytics
 *     side-effects but NOT on arrow navigation.
 *
 * Keyboard (APG roving-tabindex pattern):
 *   ArrowRight / ArrowLeft  — move to next / previous non-disabled tab, wrapping
 *   Home / End              — jump to first / last non-disabled tab
 *   Disabled tabs are skipped in the traversal order.
 *
 * Accessibility:
 *   - role="tablist" with optional aria-label (caller-supplied; we do NOT
 *     fabricate one — omitting ariaLabel leaves the attribute unset)
 *   - Each tab is role="tab" with aria-selected matching activeTabId
 *   - Active tab has tabIndex=0, inactive tabs tabIndex=-1 (roving tabindex)
 *   - aria-controls is omitted in v1 — this component doesn't own tab panels.
 *     Consumers wire their own panels and can add aria-controls later if
 *     they ship a matching TabPanel primitive.
 */

import Link from "next/link";
import { useId, useRef, type KeyboardEvent } from "react";
import "./Tabs.css";

export type Tab = {
  id: string;
  label: string;
  badge?: number | string;
  disabled?: boolean;
  href?: string;
};

export type TabsVariant = "pills" | "underline";
export type TabsSize = "sm" | "md";

export function Tabs({
  tabs,
  activeTabId,
  onChange,
  variant = "underline",
  size = "md",
  id: idProp,
  ariaLabel,
}: {
  tabs: Tab[];
  activeTabId: string;
  onChange?: (tabId: string) => void;
  variant?: TabsVariant;
  size?: TabsSize;
  id?: string;
  ariaLabel?: string;
}) {
  const reactId = useId();
  const id = idProp ?? reactId;

  const tabRefs = useRef<Array<HTMLElement | null>>([]);

  // Focusable tab indices in render order. Disabled tabs are excluded from
  // keyboard traversal (skipped). Re-derived on every render since the
  // tabs array is small and identity stability isn't a perf concern here.
  const focusableIndices: number[] = [];
  for (let i = 0; i < tabs.length; i++) {
    if (!tabs[i].disabled) focusableIndices.push(i);
  }

  const onTabKeyDown = (
    e: KeyboardEvent<HTMLElement>,
    currentIndex: number,
  ) => {
    const current = tabs[currentIndex];
    if (!current || current.disabled) return;

    const pos = focusableIndices.indexOf(currentIndex);
    if (pos === -1) return;

    let targetIndex: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        targetIndex = focusableIndices[(pos + 1) % focusableIndices.length];
        break;
      case "ArrowLeft":
        targetIndex =
          focusableIndices[
            (pos - 1 + focusableIndices.length) % focusableIndices.length
          ];
        break;
      case "Home":
        targetIndex = focusableIndices[0] ?? null;
        break;
      case "End":
        targetIndex = focusableIndices[focusableIndices.length - 1] ?? null;
        break;
      default:
        return;
    }

    if (targetIndex === null || targetIndex === currentIndex) return;
    e.preventDefault();

    const target = tabs[targetIndex];
    tabRefs.current[targetIndex]?.focus();

    // Button mode: auto-activate. Link mode: focus only — user presses
    // Enter on the <a> to navigate (Link's built-in behaviour).
    if (!target.href) {
      onChange?.(target.id);
    }
  };

  return (
    <div
      role="tablist"
      id={id}
      aria-label={ariaLabel}
      className={`tabs tabs--${variant} tabs--${size}`}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const isDisabled = Boolean(tab.disabled);
        const className =
          `tabs__tab` +
          (isActive ? " tabs__tab--active" : "") +
          (isDisabled ? " tabs__tab--disabled" : "");
        const tabIndex = isActive && !isDisabled ? 0 : -1;

        const content = (
          <>
            <span className="tabs__label">{tab.label}</span>
            {tab.badge !== undefined ? (
              <span className="tabs__badge">{tab.badge}</span>
            ) : null}
          </>
        );

        if (tab.href) {
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled || undefined}
              tabIndex={tabIndex}
              className={className}
              ref={(el: HTMLAnchorElement | null) => {
                tabRefs.current[index] = el;
              }}
              onClick={(e) => {
                if (isDisabled) {
                  e.preventDefault();
                  return;
                }
                onChange?.(tab.id);
              }}
              onKeyDown={(e) => onTabKeyDown(e, index)}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={tabIndex}
            disabled={isDisabled}
            className={className}
            ref={(el: HTMLButtonElement | null) => {
              tabRefs.current[index] = el;
            }}
            onClick={() => {
              if (isDisabled) return;
              onChange?.(tab.id);
            }}
            onKeyDown={(e) => onTabKeyDown(e, index)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
