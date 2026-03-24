"use client";

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

const SIZE_MAP: Record<string, string> = {
  md: "1.25rem",
  lg: "1.5rem",
  xl: "1.875rem",
};

export function ProductPriceElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const size = (resolved.settings.size as string) || "lg";
  const price = product?.price ?? 0;
  const currency = product?.currency ?? "SEK";

  return (
    <div style={{ fontWeight: 700, fontSize: SIZE_MAP[size] || SIZE_MAP.lg, color: "var(--text)" }}>
      Totalt: {price > 0 ? `${formatPriceDisplay(price, currency)} kr` : "—"}
    </div>
  );
}
