'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Checkbox } from './Checkbox';
import { SearchInput, type SearchInputSize } from './SearchInput';
import { getAdminPortalRoot } from './_lib/portal-root';
import './SearchSelect.css';

/**
 * SearchSelect — predictive search-with-dropdown primitive.
 *
 * Composes three existing primitives:
 *   - `SearchInput` for the visible field chrome
 *   - `Checkbox` for the per-item selection control in multi mode
 *   - Same portal positioning + dismissal contract as `Menu` and
 *     `Calendar` (drop-down by default, auto-flip to drop-up if the
 *     popover would clip below the viewport, close on scroll / ESC /
 *     outside-click)
 *
 * Two selection modes via discriminated props:
 *
 *   single   → click an item → onSelect(id) fires + popover closes.
 *              Item rows show whatever `prefix` you provided (icon,
 *              avatar, nothing).
 *
 *   multiple → click an item → onSelectedChange(nextIds) fires;
 *              popover stays open. Each item row auto-renders a
 *              `Checkbox` in the prefix slot, reflecting selection
 *              state. Caller-provided `prefix` is ignored in this
 *              mode (the checkbox owns the slot).
 *
 * Item filtering is the caller's responsibility: hand us an already-
 * filtered `items` array based on `value`. Keeps the primitive
 * agnostic to data source (sync array, async fetch, fuzzy search,
 * server query — all work).
 *
 * The popover width matches the trigger width — the dropdown reads
 * as visually anchored to the input.
 */

export type SearchSelectItem = {
  id: string;
  label: ReactNode;
  /** Single-select only — leading slot. Ignored in multi mode. */
  prefix?: ReactNode;
  /** Both modes — trailing slot (badge, count, hint text). */
  suffix?: ReactNode;
  disabled?: boolean;
};

type CommonProps = {
  value: string;
  onChange: (next: string) => void;
  items: SearchSelectItem[];
  placeholder?: string;
  size?: SearchInputSize;
  disabled?: boolean;
  /** Shown inside the popover when items.length === 0. */
  emptyMessage?: ReactNode;
  className?: string;
  /** Pixel gap between input and popover. Default 6. */
  offset?: number;
};

type SingleSelectProps = {
  multiple?: false;
  selectedId?: string;
  onSelect?: (id: string) => void;
};

type MultiSelectProps = {
  multiple: true;
  selectedIds: string[];
  onSelectedChange: (next: string[]) => void;
};

export type SearchSelectProps = CommonProps & (SingleSelectProps | MultiSelectProps);

export const SearchSelect = forwardRef<HTMLInputElement, SearchSelectProps>(
  function SearchSelect(props, ref) {
    const {
      value,
      onChange,
      items,
      placeholder,
      size = 'md',
      disabled = false,
      emptyMessage = 'Inga träffar',
      className,
      offset = 6,
    } = props;

    const reactId = useId();
    const listboxId = `ui-search-select-${reactId}-listbox`;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{
      top: number;
      left: number;
      width: number;
    }>({ top: -9999, left: -9999, width: 0 });
    const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

    // Position the popover after it mounts so we can read its rect
    // for viewport clamping + auto-flip. Mirrors Menu / Calendar.
    useLayoutEffect(() => {
      if (!open || !wrapperRef.current || !popoverRef.current) return;
      const triggerRect = wrapperRef.current.getBoundingClientRect();
      const popRect = popoverRef.current.getBoundingClientRect();
      const margin = 8;

      let top = triggerRect.bottom + offset;
      let left = triggerRect.left;
      let nextPlacement: 'bottom' | 'top' = 'bottom';

      if (top + popRect.height > window.innerHeight - margin) {
        top = triggerRect.top - popRect.height - offset;
        nextPlacement = 'top';
      }

      if (left + popRect.width > window.innerWidth - margin) {
        left = window.innerWidth - margin - popRect.width;
      }
      if (left < margin) left = margin;

      setPosition({ top, left, width: triggerRect.width });
      setPlacement(nextPlacement);
    }, [open, offset, items]);

    // Outside-click + ESC + scroll dismissal. Mirrors Menu / Calendar.
    useEffect(() => {
      if (!open) return;
      const handlePointerDown = (e: PointerEvent) => {
        const target = e.target as Node;
        if (wrapperRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setOpen(false);
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
      };
      const handleScroll = (e: Event) => {
        if (popoverRef.current?.contains(e.target as Node)) return;
        setOpen(false);
      };
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, {
        capture: true,
        passive: true,
      });
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('scroll', handleScroll, { capture: true });
      };
    }, [open]);

    const isMulti = props.multiple === true;

    const selectedIdSet = new Set(
      isMulti ? (props as MultiSelectProps).selectedIds : [],
    );

    const handleItemClick = (item: SearchSelectItem) => {
      if (item.disabled) return;
      if (isMulti) {
        const multi = props as MultiSelectProps;
        const next = selectedIdSet.has(item.id)
          ? multi.selectedIds.filter((id) => id !== item.id)
          : [...multi.selectedIds, item.id];
        multi.onSelectedChange(next);
      } else {
        const single = props as SingleSelectProps;
        single.onSelect?.(item.id);
        setOpen(false);
      }
    };

    const wrapperCls = ['ui-search-select', className].filter(Boolean).join(' ');

    return (
      <div ref={wrapperRef} className={wrapperCls}>
        <SearchInput
          ref={ref}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          size={size}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          aria-label={placeholder ?? 'Sök'}
        />
        {open &&
          (() => {
            const portalRoot = getAdminPortalRoot();
            if (!portalRoot) return null;
            return createPortal(
              <div
                ref={popoverRef}
                role="listbox"
                id={listboxId}
                aria-multiselectable={isMulti || undefined}
                data-placement={placement}
                className="ui-search-select__popover"
                style={{
                  position: 'fixed',
                  top: position.top,
                  left: position.left,
                  width: position.width,
                }}
              >
                {items.length === 0 ? (
                  <div className="ui-search-select__empty">{emptyMessage}</div>
                ) : (
                  items.map((item) => {
                    const selected = selectedIdSet.has(item.id);
                    const itemCls = [
                      'ui-search-select__item',
                      `ui-search-select__item--${size}`,
                      item.disabled && 'ui-search-select__item--disabled',
                      selected && 'ui-search-select__item--selected',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={isMulti ? selected : undefined}
                        aria-disabled={item.disabled || undefined}
                        className={itemCls}
                        onClick={() => handleItemClick(item)}
                      >
                        {isMulti ? (
                          <Checkbox
                            size="sm"
                            checked={selected}
                            // The row's onClick already drives the toggle;
                            // Checkbox's own onChange would double-fire
                            // because Checkbox stopsPropagation on click.
                            // Wire onChange to the same handler so direct
                            // clicks on the box also work.
                            onChange={() => handleItemClick(item)}
                            disabled={item.disabled}
                            aria-label={
                              typeof item.label === 'string'
                                ? item.label
                                : undefined
                            }
                          />
                        ) : item.prefix !== undefined && item.prefix !== null ? (
                          <span className="ui-search-select__item-prefix">
                            {item.prefix}
                          </span>
                        ) : null}
                        <span className="ui-search-select__item-label">
                          {item.label}
                        </span>
                        {item.suffix !== undefined && item.suffix !== null && (
                          <span className="ui-search-select__item-suffix">
                            {item.suffix}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>,
              portalRoot,
            );
          })()}
      </div>
    );
  },
);

SearchSelect.displayName = 'SearchSelect';
