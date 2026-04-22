import type { ReactNode } from "react";

/**
 * Lightweight empty state used by the companies admin. Mirrors the `.cst-empty`
 * inline pattern from the existing guests page but packaged so every
 * companies view renders a consistent layout.
 */
export function EmptyState({
  icon = "domain",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="co-empty">
      <span
        className="material-symbols-rounded co-empty__icon"
        aria-hidden="true"
      >
        {icon}
      </span>
      <h2 className="co-empty__title">{title}</h2>
      {description ? <p className="co-empty__desc">{description}</p> : null}
      {action ? <div className="co-empty__action">{action}</div> : null}
    </div>
  );
}
