"use client";

import { useEffect } from "react";
import { track } from "@/app/_lib/analytics/client";

export function CheckoutCompletedTracker({
  tenantId,
  orderId,
  orderNumber,
  totalAmount,
}: {
  tenantId: string;
  orderId: string;
  orderNumber: number;
  totalAmount: number;
}) {
  useEffect(() => {
    track({
      tenantId,
      eventType: "CHECKOUT_COMPLETED",
      payload: {
        orderId,
        orderNumber,
        totalAmount,
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
