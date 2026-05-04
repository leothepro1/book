'use client';

import {
  forwardRef,
  useId,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import './Input.css';
import './_lib/field.css';

/**
 * Input — single-line text input primitive.
 *
 * Two render modes, picked automatically:
 *   1. Bare input — when no `label` / `helpText` / `error` props are
 *      passed. Renders just the `<input>` element. Use this when the
 *      page already provides chrome (table cells, custom layouts).
 *   2. Composite field — when any of `label`, `helpText`, or `error`
 *      is provided. Renders a wrapping `<div>` with the label above
 *      the input and helper or error text below. Matches Polaris
 *      and Shopify Admin patterns. Recommended for normal forms.
 *
 * `error` (string or ReactNode) implies `invalid: true` automatically
 * — you don't need to set both. `error` overrides `helpText` when
 * present (an invalid field shouldn't show its hint, only the error).
 *
 * Controlled OR uncontrolled (matches React's native pattern).
 * forwardRef points at the underlying <input>.
 */

export type InputType =
  | 'text'
  | 'email'
  | 'url'
  | 'tel'
  | 'password'
  | 'search'
  | 'number';

export type InputSize = 'sm' | 'md' | 'lg';

export type InputProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;

  /** Composite-mode label. When omitted, input renders bare. */
  label?: ReactNode;
  /** Helper text below the input. Hidden when `error` is set. */
  helpText?: ReactNode;
  /** Error message below the input. Implies `invalid: true`. */
  error?: ReactNode;

  /**
   * Inline content rendered flush-left inside the field — typically
   * an icon or short label (currency symbol, "@"). When set, the
   * input's left padding expands to clear the slot.
   */
  prefix?: ReactNode;
  /**
   * Inline content rendered flush-right inside the field — typically
   * a unit ("px", "%"), kbd shortcut, or trailing icon. When set,
   * the input's right padding expands to clear the slot.
   */
  suffix?: ReactNode;

  type?: InputType;
  /** Visual size: sm (32 / 13), md (40 / 13), lg (48 / 14). */
  size?: InputSize;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  /** Manual override for the error visual. Usually `error` is enough. */
  invalid?: boolean;
  readOnly?: boolean;
  /** Numeric inputs only. */
  min?: number | string;
  max?: number | string;
  step?: number | string;

  id?: string;
  name?: string;
  autoComplete?: string;
  spellCheck?: boolean;
  inputMode?:
    | 'none'
    | 'text'
    | 'tel'
    | 'url'
    | 'email'
    | 'numeric'
    | 'decimal'
    | 'search';

  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    label,
    helpText,
    error,
    prefix,
    suffix,
    type = 'text',
    size = 'md',
    placeholder,
    maxLength,
    disabled = false,
    required = false,
    invalid = false,
    readOnly = false,
    min,
    max,
    step,
    id,
    name,
    autoComplete,
    spellCheck,
    inputMode,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
  },
  ref,
) {
  const reactId = useId();
  // Stable id even when caller doesn't pass one — needed for label
  // `htmlFor` and aria-describedby links.
  const inputId = id ?? `ui-input-${reactId}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const isComposite = label != null || helpText != null || error != null;
  const effectiveInvalid = invalid || error != null;

  // Wire aria-describedby so screen readers read the helper/error
  // text alongside the input. Caller-provided describedby is
  // preserved and chained.
  const describedBy =
    [
      error != null ? errorId : null,
      helpText != null && error == null ? helpId : null,
      ariaDescribedby,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const hasSlot = prefix != null || suffix != null;

  const inputCls = [
    'ui-input',
    `ui-input--${size}`,
    effectiveInvalid && 'ui-input--invalid',
    prefix != null && 'ui-input--has-prefix',
    suffix != null && 'ui-input--has-suffix',
    // Forward `className` to the input ONLY when there's no outer
    // wrapper. With a slot wrap or composite mode, the className
    // belongs on the outermost element.
    !isComposite && !hasSlot && className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  const inputElement = (
    <input
      ref={ref}
      id={inputId}
      name={name}
      type={type}
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      required={required}
      readOnly={readOnly}
      min={min}
      max={max}
      step={step}
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      inputMode={inputMode}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      aria-invalid={effectiveInvalid || undefined}
      className={inputCls}
    />
  );

  // Slot wrapper: positioning context for prefix/suffix overlays.
  // The input's padding-left/right (set in CSS via the
  // `--has-prefix` / `--has-suffix` modifiers) clears the slot
  // content so text never collides with the icon/unit.
  const inputWithSlots = hasSlot ? (
    <div
      className={[
        'ui-input-wrap',
        `ui-input-wrap--${size}`,
        disabled && 'ui-input-wrap--disabled',
        !isComposite && className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {prefix != null && (
        <span className="ui-input__prefix" aria-hidden>
          {prefix}
        </span>
      )}
      {inputElement}
      {suffix != null && (
        <span className="ui-input__suffix" aria-hidden>
          {suffix}
        </span>
      )}
    </div>
  ) : (
    inputElement
  );

  if (!isComposite) return inputWithSlots;

  const fieldCls = ['ui-field', className].filter(Boolean).join(' ');

  return (
    <div className={fieldCls}>
      {label != null && (
        <label htmlFor={inputId} className="ui-field__label">
          {label}
          {required && <span className="ui-field__required" aria-hidden>*</span>}
        </label>
      )}
      {inputWithSlots}
      {error != null ? (
        <span id={errorId} className="ui-field__error">
          {error}
        </span>
      ) : helpText != null ? (
        <span id={helpId} className="ui-field__help">
          {helpText}
        </span>
      ) : null}
    </div>
  );
});

Input.displayName = 'Input';
