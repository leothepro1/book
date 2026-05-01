'use client';

import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import './Menu.css';

/**
 * Menu — action-menu primitive (NOT a select dropdown).
 *
 * Compound API: pass any element as `trigger` and use `Menu.Item`
 * (and optionally `Menu.Divider`) as children for the menu rows.
 *
 *   <Menu trigger={<Button variant="ghost">Mer</Button>}>
 *     <Menu.Item icon="edit" onSelect={...}>Redigera</Menu.Item>
 *     <Menu.Item icon="content_copy" onSelect={...}>Duplicera</Menu.Item>
 *     <Menu.Divider />
 *     <Menu.Item icon="delete" tone="danger" onSelect={...}>Ta bort</Menu.Item>
 *   </Menu>
 *
 * Behaviours (all default-on):
 *   - Click trigger to toggle open/closed
 *   - Click outside, press ESC, or select an item to close
 *   - Portaled to document.body (escapes z-index / overflow traps)
 *   - Auto-flip vertically if the menu would clip off the bottom
 *   - Auto-clamp horizontally to viewport (won't extend past either edge)
 *   - Trigger gets `aria-haspopup="menu"` + `aria-expanded` automatically
 *
 * Controlled: pass `open` + `onOpenChange` for external state. Omit
 * for uncontrolled usage.
 *
 * Trigger contract: a single React element. The element MUST forward
 * its ref (e.g. `<Button>` does) so we can position the menu and
 * detect outside clicks. We clone the element to attach `onClick`,
 * `aria-haspopup`, and `aria-expanded` — the original onClick is
 * preserved and runs alongside the toggle.
 */

export type MenuItemTone = 'default' | 'danger';

export type MenuProps = {
  trigger: ReactElement<{
    ref?: Ref<HTMLElement>;
    onClick?: (e: MouseEvent<HTMLElement>) => void;
  }>;
  children: ReactNode;
  /** Pixel gap between trigger and menu. Default 6. */
  offset?: number;
  /** Controlled open state. Omit for uncontrolled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type MenuContextValue = {
  close: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(component: string): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used inside <Menu>`);
  }
  return ctx;
}

function MenuRoot({
  trigger,
  children,
  offset = 6,
  open: openProp,
  onOpenChange,
}: MenuProps) {
  const isControlled = typeof openProp === 'boolean';
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const triggerRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: -9999,
    left: -9999,
  });

  // Position the menu after it mounts so we can read its rect for
  // viewport clamping + auto-flip. useLayoutEffect runs synchronously
  // after DOM mutation — avoids the "menu visible at wrong spot for
  // one frame" flash.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !listRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const listRect = listRef.current.getBoundingClientRect();
    const margin = 8;

    let top = triggerRect.bottom + offset;
    let left = triggerRect.left;

    // Auto-flip vertically if not enough room below
    if (top + listRect.height > window.innerHeight - margin) {
      top = triggerRect.top - listRect.height - offset;
    }

    // Clamp horizontally so the menu never extends past the viewport
    if (left + listRect.width > window.innerWidth - margin) {
      left = window.innerWidth - margin - listRect.width;
    }
    if (left < margin) left = margin;

    setPosition({ top, left });
  }, [open, offset, children]);

  // Close on outside click + ESC. Uses pointerdown so the close fires
  // before any subsequent click handler — prevents the trigger's own
  // click from re-toggling the menu when user clicks outside.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  // Clone the trigger to attach our onClick + aria attributes. Merge
  // refs and preserve the original onClick.
  const originalRef = (trigger as { ref?: Ref<HTMLElement> }).ref;
  const originalOnClick = trigger.props.onClick;

  const handleTriggerClick = (e: MouseEvent<HTMLElement>) => {
    originalOnClick?.(e);
    setOpen(!open);
  };

  const setTriggerRef = (node: HTMLElement | null) => {
    triggerRef.current = node;
    if (typeof originalRef === 'function') {
      originalRef(node);
    } else if (originalRef && 'current' in originalRef) {
      // Merging an external ref-object: standard React pattern.
      // The lint rule treats parameter mutation as suspect, but
      // ref merging is the canonical exception.
      // eslint-disable-next-line react-hooks/immutability
      (originalRef as { current: HTMLElement | null }).current = node;
    }
  };

  const triggerNode = cloneElement(trigger, {
    ref: setTriggerRef,
    onClick: handleTriggerClick,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
  } as Partial<typeof trigger.props>);

  const ctx: MenuContextValue = {
    close: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
  };

  return (
    <>
      {triggerNode}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            role="menu"
            className="ui-menu"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
            }}
          >
            <MenuContext.Provider value={ctx}>{children}</MenuContext.Provider>
          </div>,
          document.body,
        )}
    </>
  );
}

export type MenuItemProps = {
  children: ReactNode;
  tone?: MenuItemTone;
  disabled?: boolean;
  onSelect?: () => void;
};

function MenuItem({
  children,
  tone = 'default',
  disabled = false,
  onSelect,
}: MenuItemProps) {
  const { close } = useMenuContext('Menu.Item');

  const handleClick = () => {
    if (disabled) return;
    onSelect?.();
    close();
  };

  const cls = ['ui-menu__item', tone === 'danger' && 'ui-menu__item--danger']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="menuitem"
      className={cls}
      disabled={disabled}
      onClick={handleClick}
    >
      <span className="ui-menu__label">{children}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="ui-menu__divider" role="separator" />;
}

export const Menu = Object.assign(MenuRoot, {
  Item: MenuItem,
  Divider: MenuDivider,
});
