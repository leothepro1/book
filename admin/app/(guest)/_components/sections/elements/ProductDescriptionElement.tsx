"use client";

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";

const SIZE_MAP: Record<string, string> = {
  xs: "0.8rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
};

export function ProductDescriptionElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const { settings } = resolved;
  const alignment = (settings.alignment as string) || "left";
  const size = (settings.size as string) || "md";

  return (
    <div
      style={{
        textAlign: alignment as React.CSSProperties["textAlign"],
        fontSize: SIZE_MAP[size] || SIZE_MAP.md,
        fontWeight: 400,
        color: "var(--text)",
        opacity: 0.8,
        margin: 0,
        lineHeight: 1.6,
      }}
      dangerouslySetInnerHTML={{ __html: product?.description ?? "Produktbeskrivning" }}
    />
  );
}
