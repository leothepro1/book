'use client';

import {
  forwardRef,
  useId,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import './Textarea.css';
import './_lib/field.css';

/**
 * Textarea — multi-line text input primitive.
 *
 * Two render modes (mirrors Input):
 *   1. Bare textarea — when no `label` / `helpText` / `error` props
 *      are passed. Useful for table cells and custom layouts.
 *   2. Composite field — when any of `label`, `helpText`, or `error`
 *      is provided. Renders a wrapping `<div>` with the label above
 *      the textarea and helper or error text below.
 *
 * `error` (string or ReactNode) implies `invalid: true` automatically.
 * `error` overrides `helpText` when present.
 *
 * Controlled OR uncontrolled. forwardRef points at the underlying
 * <textarea> for focus management, scroll-into-view, and measurement.
 */

export type TextareaSize = 'sm' | 'md' | 'lg';

export type TextareaProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;

  /** Composite-mode label. When omitted, textarea renders bare. */
  label?: ReactNode;
  /** Helper text below the textarea. Hidden when `error` is set. */
  helpText?: ReactNode;
  /** Error message below the textarea. Implies `invalid: true`. */
  error?: ReactNode;

  size?: TextareaSize;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  /** Manual override for the error visual. Usually `error` is enough. */
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
      label,
      helpText,
      error,
      size = 'md',
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
    const reactId = useId();
    const inputId = id ?? `ui-textarea-${reactId}`;
    const helpId = `${inputId}-help`;
    const errorId = `${inputId}-error`;

    const isComposite = label != null || helpText != null || error != null;
    const effectiveInvalid = invalid || error != null;

    const describedBy =
      [
        error != null ? errorId : null,
        helpText != null && error == null ? helpId : null,
        ariaDescribedby,
      ]
        .filter(Boolean)
        .join(' ') || undefined;

    const inputCls = [
      'ui-textarea',
      `ui-textarea--${size}`,
      effectiveInvalid && 'ui-textarea--invalid',
      !isComposite && className,
    ]
      .filter(Boolean)
      .join(' ');

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e.target.value);
    };

    const style: CSSProperties = { resize };

    const textareaElement = (
      <textarea
        ref={ref}
        id={inputId}
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
        aria-describedby={describedBy}
        aria-required={required || undefined}
        aria-invalid={effectiveInvalid || undefined}
        className={inputCls}
        style={style}
      />
    );

    if (!isComposite) return textareaElement;

    const fieldCls = ['ui-field', className].filter(Boolean).join(' ');

    return (
      <div className={fieldCls}>
        {label != null && (
          <label htmlFor={inputId} className="ui-field__label">
            {label}
            {required && <span className="ui-field__required" aria-hidden>*</span>}
          </label>
        )}
        {textareaElement}
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
  },
);

Textarea.displayName = 'Textarea';
