"use client";

import type { OrderFinancialStatus, OrderFulfillmentStatus } from "@prisma/client";
import {
  BUCKET_STYLES,
  FINANCIAL_LABELS,
  FULFILLMENT_LABELS,
  getFinancialBucket,
  getFulfillmentBucket,
} from "@/app/_lib/orders/badge";

type Props =
  | { type: "financial"; financial: OrderFinancialStatus; fulfillment: OrderFulfillmentStatus }
  | { type: "fulfillment"; fulfillment: OrderFulfillmentStatus };

export function OrderBadge(props: Props) {
  const bucket = props.type === "financial"
    ? getFinancialBucket(props.financial, props.fulfillment)
    : getFulfillmentBucket(props.fulfillment);

  const label = props.type === "financial"
    ? FINANCIAL_LABELS[props.financial]
    : FULFILLMENT_LABELS[props.fulfillment];

  const style = BUCKET_STYLES[bucket];

  return (
    <span
      style={{
        background: style.background,
        color: style.color,
        borderRadius: 8,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}
