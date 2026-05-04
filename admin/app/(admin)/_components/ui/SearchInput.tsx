'use client';

import { forwardRef, useId, type ChangeEvent } from 'react';
import { SearchIcon } from '@/app/_components/SearchIcon';
import './SearchInput.css';

/**
 * SearchInput — single-line search field primitive.
 *
 * The platform's only "named-by-purpose" input. Reused everywhere we
 * surface a search affordance (table filters, picker modals, sidebar
 * search, header search). The leading icon is a Geist-style magnifier
 * SVG (NOT a Material Symbol) — the lone exception to the
 * Material-Symbols-Rounded rule, kept consistent across every search
 * surface so the visual vocabulary doesn't fragment.
 *
 * Visually inherits `Input`'s chrome by referencing the same
 * `--textarea-*` token set: identical border, focus ring, error
 * halo, hover, disabled. Heights also match Input's three sizes
 * (sm 32 / md 40 / lg 48) so a `<SearchInput>` and `<Input>` sitting
 * side-by-side in a toolbar align perfectly.
 *
 * Bare-only (no composite label/helpText/error mode) — search
 * inputs land in toolbar / header chrome, not form contexts. If a
 * composite-mode use-case shows up later, lift the pattern from
 * `Input` then.
 *
 * Controlled OR uncontrolled (matches React's native pattern).
 * forwardRef points at the underlying <input>.
 */

export type SearchInputSize = 'sm' | 'md' | 'lg';

export type SearchInputProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (next: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;

  /** Default: "Sök…" */
  placeholder?: string;
  /** Visual size: sm (32) / md (40) / lg (48). */
  size?: SearchInputSize;
  disabled?: boolean;
  readOnly?: boolean;
  /** Mirrors Input — red border + halo when set. */
  invalid?: boolean;
  autoFocus?: boolean;
  maxLength?: number;

  id?: string;
  name?: string;
  autoComplete?: string;

  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

// Icon is locked at 15×15 across all sizes. Same glyph weight in
// every context — sm/md/lg differ in input height and padding, not
// in the affordance icon.
const ICON_PX = 15;

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      value,
      defaultValue,
      onChange,
      onBlur,
      onFocus,
      placeholder = 'Sök…',
      size = 'md',
      disabled = false,
      readOnly = false,
      invalid = false,
      autoFocus = false,
      maxLength,
      id,
      name,
      autoComplete = 'off',
      className,
      'aria-label': ariaLabel = 'Sök',
      'aria-labelledby': ariaLabelledby,
    },
    ref,
  ) {
    const reactId = useId();
    const inputId = id ?? `ui-search-${reactId}`;

    const wrapperCls = [
      'ui-search',
      `ui-search--${size}`,
      disabled && 'ui-search--disabled',
      invalid && 'ui-search--invalid',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value);
    };

    return (
      <div className={wrapperCls}>
        {/* Wrapper span owns position + color. The SVG's inline
            `color: currentColor` inherits from this span — that's
            why we can't put the class directly on the SVG (inline
            style beats class-based color regardless of specificity). */}
        <span className="ui-search__icon" aria-hidden>
          <SearchIcon size={ICON_PX} />
        </span>
        <input
          ref={ref}
          id={inputId}
          name={name}
          type="search"
          inputMode="search"
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          onBlur={onBlur}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-invalid={invalid || undefined}
          className="ui-search__input"
        />
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';
