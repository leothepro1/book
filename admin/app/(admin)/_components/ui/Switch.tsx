'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import './Switch.css';

/**
 * Switch — segmented single-select control.
 *
 * iOS-style sliding indicator: a pill behind the active option moves
 * (left + width) to the new selection. Lift-and-shift of the editor's
 * `SegmentedControl` (FieldSegmented.tsx) — same visual contract,
 * tokenised colours/shadows, plus controlled/uncontrolled, sizes,
 * disabled, and a real radiogroup ARIA contract.
 *
 * Naming note — distinct from `Toggle`:
 *   Toggle  → binary on/off (slider thumb)
 *   Switch  → multi-option segmented (sliding indicator)
 *
 * The control fills its container; each segment shares width via
 * `flex: 1`. Wrap in a sized container if you need a narrower switch.
 *
 * Controlled OR uncontrolled (matches React's native pattern).
 * forwardRef points at the root container — useful for measurement
 * and scroll-into-view.
 */

export type SwitchSize = 'sm' | 'md' | 'lg';

export type SwitchOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SwitchProps = {
  options: SwitchOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  size?: SwitchSize;
  /** Disables every segment in one shot. Per-segment disabled lives on options[]. */
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export const Switch = forwardRef<HTMLDivElement, SwitchProps>(function Switch(
  {
    options,
    value: valueProp,
    defaultValue,
    onChange,
    size = 'md',
    disabled = false,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  },
  ref,
) {
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue ?? options[0]?.value ?? '',
  );
  const value = isControlled ? valueProp : internalValue;

  const setValue = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };

  // ── Refs + indicator positioning ──
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(
    null,
  );
  // Skip the slide animation on the very first paint — otherwise the
  // indicator would visibly fly in from `left: 0`.
  const initialRef = useRef(true);

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    const btn = btnRefs.current.get(value);
    if (!container || !btn) {
      setIndicator(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [value]);

  useEffect(() => {
    updateIndicator();
    requestAnimationFrame(() => {
      initialRef.current = false;
    });
  }, [updateIndicator]);

  // Reposition on container resize (responsive layouts, sidebar
  // collapse, window resize) so the indicator stays under the active
  // segment.
  useEffect(() => {
    const observer = new ResizeObserver(updateIndicator);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateIndicator]);

  const cls = [
    'ui-switch',
    `ui-switch--${size}`,
    disabled && 'ui-switch--disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={containerRef}
      className={cls}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      {indicator && (
        <div
          className="ui-switch__indicator"
          style={{
            left: indicator.left,
            width: indicator.width,
            transition: initialRef.current ? 'none' : undefined,
          }}
        />
      )}
      {options.map((opt) => {
        const isActive = opt.value === value;
        const isDisabled = disabled || opt.disabled === true;
        const btnCls = [
          'ui-switch__btn',
          isActive && 'ui-switch__btn--active',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) btnRefs.current.set(opt.value, el);
              else btnRefs.current.delete(opt.value);
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={isDisabled}
            className={btnCls}
            onClick={() => setValue(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
});

Switch.displayName = 'Switch';
