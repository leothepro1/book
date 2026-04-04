"use client";

import { useEffect, useState } from "react";
import { getOrderFormatSettings } from "@/app/(admin)/settings/general/actions";
import { formatOrderNumber } from "@/app/_lib/orders/format";

let _cached: { prefix: string; suffix: string } | null = null;

/**
 * Hook that provides a tenant-aware order number formatter.
 * Loads prefix/suffix once and caches for the session.
 */
export function useOrderFormat() {
  const [format, setFormat] = useState(_cached);

  useEffect(() => {
    if (_cached) return;
    getOrderFormatSettings().then((data) => {
      if (data) {
        _cached = {
          prefix: data.orderNumberPrefix,
          suffix: data.orderNumberSuffix,
        };
        setFormat(_cached);
      }
    });
  }, []);

  return (orderNumber: number | string): string => {
    if (!format) return `#${orderNumber}`;
    return formatOrderNumber(orderNumber, format.prefix || "#", format.suffix);
  };
}
