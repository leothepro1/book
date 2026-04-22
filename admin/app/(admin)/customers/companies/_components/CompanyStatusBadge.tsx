import type { CompanyStatus } from "@prisma/client";

/**
 * Status badge combining Company.status + Company.orderingApproved.
 *
 * A company that is ACTIVE but orderingApproved=false is in a "pending
 * approval" state — rendered amber. Archived overrides. Accessibility: the
 * label is always the truth (colour is a hint, never the sole signal).
 */
export function CompanyStatusBadge({
  status,
  orderingApproved,
}: {
  status: CompanyStatus;
  orderingApproved: boolean;
}) {
  if (status === "ARCHIVED") {
    return <span className="co-badge co-badge--muted">Arkiverad</span>;
  }
  if (!orderingApproved) {
    return <span className="co-badge co-badge--amber">Väntar godkännande</span>;
  }
  return <span className="co-badge co-badge--green">Aktiv</span>;
}
