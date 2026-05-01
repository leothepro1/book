'use client';

import {
  forwardRef,
  type ChangeEvent,
} from 'react';
import './Input.css';

/**
 * Input — single-line text input primitive.
 *
 * Visually identical to Textarea (default / error / disabled all
 * mirror the same chrome and tokens) — the only differences are
 * structural: single-line height, type attribute, no resize, no
 * rows. Label, helpText, error message and any sibling chrome are
 * the composer's concern, same as Textarea.
 *
 * Visual states are toggled via `invalid` (red border + red halo)
 * and the native `disabled` attribute.
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

  type?: InputType;
  /** Visual size: sm (32 / 13), md (40 / 13), lg (48 / 14). */
  size?: InputSize;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  /** Toggle error visual state (red border + red halo). The error
      message itself is a sibling concern. */
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
  const cls = [
    'ui-input',
    `ui-input--${size}`,
    invalid && 'ui-input--invalid',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <input
      ref={ref}
      id={id}
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
      aria-describedby={ariaDescribedby}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      className={cls}
    />
  );
});

Input.displayName = 'Input';
