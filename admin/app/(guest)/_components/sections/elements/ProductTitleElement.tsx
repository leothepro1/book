"use client";

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useProduct } from "@/app/(guest)/_lib/product-context/ProductContext";

const SIZE_MAP: Record<string, string> = {
  xs: "1rem",
  sm: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
  md: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)",
  lg: "clamp(2.25rem, 1.75rem + 2vw, 3.25rem)",
  xl: "clamp(2.75rem, 2rem + 3vw, 4rem)",
};

export function ProductTitleElement({ resolved }: { resolved: ResolvedElement }) {
  const product = useProduct();
  const { settings } = resolved;
  const size = (settings.size as string) || "lg";
  const alignment = (settings.alignment as string) || "left";

  return (
    <h1
      style={{
        textAlign: alignment as React.CSSProperties["textAlign"],
        fontSize: SIZE_MAP[size] || SIZE_MAP.lg,
        margin: 0,
        lineHeight: 1.2,
        fontWeight: 700,
        fontFamily: "var(--font-heading)",
        color: "var(--text)",
      }}
    >
      {product?.title ?? "Produkttitel"}
    </h1>
  );
}
