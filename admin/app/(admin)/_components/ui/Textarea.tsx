'use client';

import {
  forwardRef,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import './Textarea.css';

/**
 * Textarea — multi-line text input primitive.
 *
 * Scope is the input element itself. Label, helpText, error message,
 * and character count are all separate concerns — composers add them
 * as siblings (or via a future <Field> wrapper). Keeping the
 * primitive narrow means it composes cleanly into any layout: card,
 * row, modal, settings panel, draft form.
 *
 * Visual states are toggled via `invalid` (red border + red focus
 * border) and the native `disabled` attribute. The wrapper handles
 * the rest — there's no `error` string here, just a flag.
 *
 * Controlled OR uncontrolled (matches React's native pattern).
 * forwardRef points at the underlying <textarea> for focus
 * management, scroll-into-view, and measurement.
 */

export type TextareaProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;

  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  /** Toggle error visual state (red border). The error message
      itself is a sibling concern — render it next to the textarea
      with whatever layout you need. */
  invalid?: boolean;
  /** User resize handle. Defaults to vertical. */
  resize?: 'vertical' | 'horizontal' | 'both' | 'none';

  id?: string;
  name?: string;
  autoComplete?: string;
  spellCheck?: boolean;

  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      value,
      defaultValue,
      onChange,
      onBlur,
      onFocus,
      placeholder,
      rows = 4,
      maxLength,
      disabled = false,
      required = false,
      invalid = false,
      resize = 'vertical',
      id,
      name,
      autoComplete,
      spellCheck,
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      'aria-describedby': ariaDescribedby,
    },
    ref,
  ) {
    const cls = ['ui-textarea', invalid && 'ui-textarea--invalid', className]
      .filter(Boolean)
      .join(' ');

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e.target.value);
    };

    const style: CSSProperties = { resize };

    return (
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        className={cls}
        style={style}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
