/**
 * Admin Toggle — iOS-style switch.
 *
 * Single source for the `.admin-toggle` pattern. Same markup + classes
 * as HomeClient's local Toggle helper (kept for backward-compat there),
 * same CSS (base.css `.admin-toggle` / `.admin-toggle-on` / `.admin-toggle-thumb`).
 *
 * Accessibility: renders a native `<button role="switch">`. Do NOT nest
 * this inside another `<button>` — use the Toggle as the only interactive
 * element on its row, or place a non-interactive `<div>` container around
 * it with `cursor: default`.
 */

"use client";

type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** When true, render the compact `admin-toggle--sm` variant. */
  size?: "default" | "sm";
};

export function Toggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  size = "default",
}: ToggleProps) {
  const classes = [
    "admin-toggle",
    checked ? "admin-toggle-on" : "",
    size === "sm" ? "admin-toggle--sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={classes}
    >
      <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-rounded">
        check
      </span>
      <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-rounded">
        remove
      </span>
      <span className="admin-toggle-thumb" />
    </button>
  );
}
