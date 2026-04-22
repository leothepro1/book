import Link from "next/link";
import type { StoreCreditReason } from "@prisma/client";
import {
  getStoreCreditBalance,
  listTransactionsForLocation,
} from "@/app/_lib/companies";
import { EmptyState } from "../../../../_components/EmptyState";
import { MoneyCell } from "../../../../_components/MoneyCell";
import { IssueStoreCreditForm } from "../../../../_components/LocationEditCards";
import { formatDateTimeSv } from "../../../../_components/formatters";

const REASON_LABELS: Record<StoreCreditReason, string> = {
  ADMIN_ISSUE: "Utfärdad av admin",
  REFUND: "Återbetalning",
  ORDER_PAYMENT: "Orderbetalning",
  EXPIRATION: "Utgången kredit",
  ADJUSTMENT: "Justering",
};

export async function LocationStoreCreditTab({
  tenantId,
  locationId,
  companyId,
  cursor,
  basePath,
}: {
  tenantId: string;
  locationId: string;
  companyId: string;
  cursor: string | undefined;
  basePath: string;
}) {
  const [balance, page] = await Promise.all([
    getStoreCreditBalance({ tenantId, locationId }),
    listTransactionsForLocation({
      tenantId,
      locationId,
      cursor,
      take: 50,
    }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="co-card">
        <h2 className="co-card__title">Aktuellt saldo</h2>
        <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>
          <MoneyCell
            cents={balance}
            tone={balance > BigInt(0) ? "positive" : "muted"}
          />
        </div>
      </section>

      <IssueStoreCreditForm companyId={companyId} locationId={locationId} />

      {page.transactions.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Inga transaktioner"
          description="När store credit utfärdas eller förbrukas syns händelserna här."
        />
      ) : (
        <>
          <table className="co-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th className="co-table__numeric">Belopp</th>
                <th>Orsak</th>
                <th>Order</th>
                <th>Staff</th>
                <th>Notering</th>
              </tr>
            </thead>
            <tbody>
              {page.transactions.map((t) => {
                const negative = t.amountCents < BigInt(0);
                return (
                  <tr key={t.id}>
                    <td>{formatDateTimeSv(t.createdAt)}</td>
                    <td className="co-table__numeric">
                      <MoneyCell
                        cents={t.amountCents}
                        tone={negative ? "negative" : "positive"}
                      />
                    </td>
                    <td>{REASON_LABELS[t.reason]}</td>
                    <td>
                      {t.orderId ? (
                        <Link href={`/orders/${t.orderId}`}>Order</Link>
                      ) : (
                        <span className="co-muted">—</span>
                      )}
                    </td>
                    <td>
                      {t.createdByStaffId || <span className="co-muted">—</span>}
                    </td>
                    <td>
                      {t.note ? (
                        t.note
                      ) : (
                        <span className="co-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <StoreCreditPagination
            basePath={basePath}
            cursor={cursor}
            nextCursor={page.nextCursor}
          />
        </>
      )}
    </div>
  );
}

function StoreCreditPagination({
  basePath,
  cursor,
  nextCursor,
}: {
  basePath: string;
  cursor: string | undefined;
  nextCursor: string | null;
}) {
  const firstHref = basePath;
  const nextHref = nextCursor
    ? `${basePath}&cursor=${encodeURIComponent(nextCursor)}`
    : basePath;
  const hasPrev = !!cursor;
  const hasNext = !!nextCursor;
  if (!hasPrev && !hasNext) return null;
  return (
    <div className="co-pagination">
      <div className="co-pagination__spacer" />
      <Link
        href={firstHref}
        aria-disabled={!hasPrev}
        className="co-pagination__btn"
      >
        Första sidan
      </Link>
      <Link
        href={nextHref}
        aria-disabled={!hasNext}
        className="co-pagination__btn"
      >
        Nästa
      </Link>
    </div>
  );
}
