"use client";

import { useRouter, useSearchParams } from "next/navigation";
import DiscountForm from "../_components/DiscountForm";

type DiscountType = "order_amount" | "line_item_amount" | "buy_x_get_y" | "combined";
const VALID_TYPES: DiscountType[] = ["order_amount", "line_item_amount", "buy_x_get_y", "combined"];

export default function NewDiscountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as DiscountType | null;
  const discountType = typeParam && VALID_TYPES.includes(typeParam) ? typeParam : null;

  if (!discountType) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--admin-text-secondary)", marginBottom: 16 }}>
              Välj rabattyp via knappen &quot;Skapa rabatt&quot; på rabattsidan.
            </p>
            <button className="settings-btn--connect" onClick={() => router.push("/discounts")}>
              Tillbaka till rabatter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <DiscountForm discountType={discountType} />;
}
