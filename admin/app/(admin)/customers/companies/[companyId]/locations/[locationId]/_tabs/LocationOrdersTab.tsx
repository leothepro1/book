import Link from "next/link";
import type { OrderFinancialStatus, OrderFulfillmentStatus } from "@prisma/client";
import { listOrdersForLocation } from "@/app/_lib/companies";
import { EmptyState } from "../../../../_components/EmptyState";
import { MoneyCell } from "../../../../_components/MoneyCell";
import { formatDateSv } from "../../../../_components/formatters";

function financialLabel(s: OrderFinancialStatus): {
  label: string;
  cls: string;
} {
  switch (s) {
    case "PAID":
      return { label: "Betald", cls: "co-badge--green" };
    case "AUTHORIZED":
      return { label: "Auktoriserad", cls: "co-badge--blue" };
    case "PENDING":
      return { label: "Väntar betalning", cls: "co-badge--amber" };
    case "PARTIALLY_REFUNDED":
      return { label: "Delåterbetald", cls: "co-badge--muted" };
    case "REFUNDED":
      return { label: "Återbetald", cls: "co-badge--muted" };
    case "VOIDED":
      return { label: "Ogiltigförklarad", cls: "co-badge--muted" };
  }
}

function fulfillmentLabel(s: OrderFulfillmentStatus): {
  label: string;
  cls: string;
} {
  switch (s) {
    case "FULFILLED":
      return { label: "Uppfylld", cls: "co-badge--green" };
    case "SCHEDULED":
      return { label: "Schemalagd", cls: "co-badge--blue" };
    case "IN_PROGRESS":
      return { label: "Pågår", cls: "co-badge--blue" };
    case "UNFULFILLED":
      return { label: "Ej uppfylld", cls: "co-badge--muted" };
    case "ON_HOLD":
      return { label: "På vänt", cls: "co-badge--amber" };
    case "CANCELLED":
      return { label: "Avbokad", cls: "co-badge--muted" };
  }
}

export async function LocationOrdersTab({
  tenantId,
  locationId,
  cursor,
  onlyUnpaid,
  basePath,
}: {
  tenantId: string;
  locationId: string;
  cursor: string | undefined;
  onlyUnpaid: boolean;
  basePath: string;
}) {
  const page = await listOrdersForLocation({
    tenantId,
    locationId,
    onlyUnpaid,
    cursor,
    take: 50,
  });

  const toggleHref = onlyUnpaid ? basePath : `${basePath}&onlyUnpaid=true`;
  const toggleLabel = onlyUnpaid
    ? "Visa alla ordrar"
    : "Visa endast obetalda";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="co-filters" style={{ border: "none", padding: 0 }}>
        <Link href={toggleHref} className="co-pagination__btn">
          {toggleLabel}
        </Link>
      </div>

      {page.orders.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={onlyUnpaid ? "Inga obetalda ordrar" : "Inga ordrar"}
          description={
            onlyUnpaid
              ? "Den här platsen har inga ordrar som väntar på betalning."
              : "Ordrar placerade mot den här platsen visas här."
          }
        />
      ) : (
        <>
          <table className="co-table">
            <thead>
              <tr>
                <th>Order-nr</th>
                <th>Datum</th>
                <th>Status</th>
                <th className="co-table__numeric">Totalsumma</th>
                <th>PO-nr</th>
                <th>Förfallodag</th>
                <th className="co-table__numeric">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {page.orders.map((o) => {
                const fin = financialLabel(o.financialStatus);
                const ful = fulfillmentLabel(o.fulfillmentStatus);
                const balance = o.balanceAmountCents;
                const overdue =
                  o.financialStatus === "PENDING" &&
                  o.paymentDueAt !== null &&
                  o.paymentDueAt < new Date();
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`}>#{o.orderNumber}</Link>
                    </td>
                    <td>{formatDateSv(o.createdAt)}</td>
                    <td>
                      <div className="co-status-stack">
                        <span className={`co-badge ${fin.cls}`}>
                          {fin.label}
                        </span>
                        <span className={`co-badge ${ful.cls}`}>
                          {ful.label}
                        </span>
                      </div>
                    </td>
                    <td className="co-table__numeric">
                      <MoneyCell cents={o.totalAmount} />
                    </td>
                    <td>
                      {o.poNumber || <span className="co-muted">—</span>}
                    </td>
                    <td>
                      {o.paymentDueAt ? (
                        <span
                          className={overdue ? "co-money--negative" : undefined}
                        >
                          {formatDateSv(o.paymentDueAt)}
                        </span>
                      ) : (
                        <span className="co-muted">—</span>
                      )}
                    </td>
                    <td className="co-table__numeric">
                      {balance !== null ? (
                        <MoneyCell
                          cents={balance}
                          tone={balance > BigInt(0) ? "negative" : "muted"}
                        />
                      ) : (
                        <span className="co-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <OrdersPagination
            basePath={basePath}
            onlyUnpaid={onlyUnpaid}
            cursor={cursor}
            nextCursor={page.nextCursor}
          />
        </>
      )}
    </div>
  );
}

function OrdersPagination({
  basePath,
  onlyUnpaid,
  cursor,
  nextCursor,
}: {
  basePath: string;
  onlyUnpaid: boolean;
  cursor: string | undefined;
  nextCursor: string | null;
}) {
  if (!cursor && !nextCursor) return null;
  const suffix = onlyUnpaid ? "&onlyUnpaid=true" : "";
  const firstHref = `${basePath}${suffix}`;
  const nextHref = nextCursor
    ? `${basePath}${suffix}&cursor=${encodeURIComponent(nextCursor)}`
    : firstHref;
  return (
    <div className="co-pagination">
      <div className="co-pagination__spacer" />
      <Link
        href={firstHref}
        aria-disabled={!cursor}
        className="co-pagination__btn"
      >
        Första sidan
      </Link>
      <Link
        href={nextHref}
        aria-disabled={!nextCursor}
        className="co-pagination__btn"
      >
        Nästa
      </Link>
    </div>
  );
}
