'use client';

import {
  createContext,
  useContext,
  useId,
  useMemo,
  type ReactNode,
} from 'react';
import './Choicebox.css';

/**
 * Choicebox — large tap-target alternative to Radio / Checkbox.
 *
 * The whole card is the click surface; the indicator (radio dot or
 * checkbox tick) is a visual hint, not the only target. Useful for
 * selection lists where each option needs a title + a brief
 * description (delivery options, plan tiers, payment methods,
 * shipping rules etc).
 *
 * Composition:
 *
 *   <ChoiceboxGroup type="radio" value={x} onChange={setX}>
 *     <Choicebox value="a" title="Standard" description="3–5 dagar" />
 *     <Choicebox value="b" title="Express"  description="Nästa dag" />
 *   </ChoiceboxGroup>
 *
 *   <ChoiceboxGroup type="checkbox" values={vs} onChange={setVs}>
 *     <Choicebox value="a" title="Föreslå tillägg" description="..." />
 *     <Choicebox value="b" title="Skicka påminnelse" disabled />
 *   </ChoiceboxGroup>
 *
 * Selection semantics live on the Group (radio = single, checkbox =
 * multi) — the Choicebox itself is "dumb" and just renders. This
 * keeps individual items composable and matches the WAI-ARIA
 * radiogroup / group pattern.
 *
 * Disabled state can be set per item OR on the whole group; an
 * item.disabled=true overrides group.disabled=false.
 */

// ── Context ─────────────────────────────────────────────────

type ChoiceboxContextValue = {
  type: 'radio' | 'checkbox';
  isSelected: (value: string) => boolean;
  toggle: (value: string) => void;
  groupDisabled: boolean;
};

const ChoiceboxContext = createContext<ChoiceboxContextValue | null>(null);

function useChoiceboxContext(component: string): ChoiceboxContextValue {
  const ctx = useContext(ChoiceboxContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used inside <ChoiceboxGroup>`);
  }
  return ctx;
}

// ── Group ───────────────────────────────────────────────────

type ChoiceboxGroupBase = {
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export type ChoiceboxGroupProps =
  | (ChoiceboxGroupBase & {
      type: 'radio';
      value: string;
      onChange: (next: string) => void;
    })
  | (ChoiceboxGroupBase & {
      type: 'checkbox';
      values: string[];
      onChange: (next: string[]) => void;
    });

export function ChoiceboxGroup(props: ChoiceboxGroupProps) {
  const {
    type,
    disabled = false,
    children,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
  } = props;

  // Extract the discriminated-union branches into stable references
  // so the useMemo deps array stays statically analysable. `null`
  // for the inactive branch is intentional — the deps array sees a
  // primitive change when the user flips the type.
  const radioValue = type === 'radio' ? props.value : null;
  const checkboxValues = type === 'checkbox' ? props.values : null;
  const onChange = props.onChange;

  const ctx = useMemo<ChoiceboxContextValue>(() => {
    if (type === 'radio') {
      return {
        type: 'radio',
        isSelected: (v) => v === radioValue,
        toggle: (v) => {
          if (v === radioValue) return; // radio: clicking selected is a no-op
          (onChange as (next: string) => void)(v);
        },
        groupDisabled: disabled,
      };
    }
    const values = checkboxValues ?? [];
    return {
      type: 'checkbox',
      isSelected: (v) => values.includes(v),
      toggle: (v) => {
        const next = values.includes(v)
          ? values.filter((x) => x !== v)
          : [...values, v];
        (onChange as (next: string[]) => void)(next);
      },
      groupDisabled: disabled,
    };
  }, [type, disabled, radioValue, checkboxValues, onChange]);

  const cls = ['ui-choicebox-group', className].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      role={type === 'radio' ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-disabled={disabled || undefined}
    >
      <ChoiceboxContext.Provider value={ctx}>
        {children}
      </ChoiceboxContext.Provider>
    </div>
  );
}

// ── Item ────────────────────────────────────────────────────

export type ChoiceboxProps = {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function Choicebox({
  value,
  title,
  description,
  disabled: itemDisabled,
  className,
}: ChoiceboxProps) {
  const { type, isSelected, toggle, groupDisabled } =
    useChoiceboxContext('Choicebox');
  const titleId = useId();
  const descId = useId();

  const selected = isSelected(value);
  const disabled = itemDisabled || groupDisabled;

  const cls = [
    'ui-choicebox',
    selected && 'ui-choicebox--selected',
    disabled && 'ui-choicebox--disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (disabled) return;
    toggle(value);
  };

  return (
    <button
      type="button"
      role={type === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={handleClick}
      className={cls}
    >
      <span className="ui-choicebox__body">
        <span id={titleId} className="ui-choicebox__title">
          {title}
        </span>
        {description && (
          <span id={descId} className="ui-choicebox__description">
            {description}
          </span>
        )}
      </span>
      <span
        className={`ui-choicebox__indicator ui-choicebox__indicator--${type}`}
        aria-hidden
      >
        {type === 'checkbox' ? (
          <svg
            viewBox="0 0 10 8"
            width="10"
            height="8"
            fill="none"
            className="ui-choicebox__check"
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <span className="ui-choicebox__dot" />
        )}
      </span>
    </button>
  );
}
