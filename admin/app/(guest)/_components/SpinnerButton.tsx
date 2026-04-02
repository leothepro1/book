"use client";

import { useState, useCallback, type ReactNode, type ButtonHTMLAttributes } from "react";
import "./spinner-button.css";

interface SpinnerButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Async handler — spinner shows until promise resolves/rejects. */
  onClick: () => Promise<void> | void;
  children: ReactNode;
}

/**
 * Button with automatic loading spinner on click.
 *
 * Text scales down and fades out, then a spinner grows in while
 * spinning. Prevents double-clicks. Restores on completion/error.
 *
 * Usage:
 *   <SpinnerButton className="co__confirm-btn" onClick={handlePay}>
 *     Bekräfta och betala
 *   </SpinnerButton>
 */
export function SpinnerButton({ onClick, children, disabled, className, ...rest }: SpinnerButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  }, [onClick, loading, disabled]);

  return (
    <button
      type="button"
      className={`sb ${className ?? ""}`}
      disabled={disabled || loading}
      onClick={handleClick}
      {...rest}
    >
      <span className={`sb__label${loading ? " sb__label--hidden" : ""}`}>{children}</span>
      <span className={`sb__spinner${loading ? " sb__spinner--visible" : ""}`} />
    </button>
  );
}
