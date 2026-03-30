"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loading } from "@/app/_components/Loading/Loading";
import DiscountForm from "../_components/DiscountForm";
import type { ExistingDiscount } from "../_components/DiscountForm";
import "../discounts.css";
import "../../products/_components/product-form.css";

type DiscountType = "order_amount" | "line_item_amount" | "buy_x_get_y" | "combined";

function resolveDiscountType(d: ExistingDiscount): DiscountType {
  if (d.targetType === "ORDER" && d.conditions.some((c) => c.type === "MIN_NIGHTS" || c.type === "DAYS_IN_ADVANCE")) {
    return "combined";
  }
  if (d.targetType === "LINE_ITEM") return "line_item_amount";
  return "order_amount";
}

export default function DiscountDetailPage() {
  const { discountId } = useParams<{ discountId: string }>();
  const router = useRouter();
  const [discount, setDiscount] = useState<ExistingDiscount | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDiscount = useCallback(async () => {
    const res = await fetch(`/api/admin/discounts/${discountId}`);
    if (res.ok) {
      const d = await res.json();
      setDiscount({
        id: d.id,
        title: d.title,
        description: d.description,
        method: d.method,
        valueType: d.valueType,
        value: d.value,
        targetType: d.targetType,
        status: d.status,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        usageLimit: d.usageLimit,
        combinesWithProductDiscounts: d.combinesWithProductDiscounts,
        combinesWithOrderDiscounts: d.combinesWithOrderDiscounts,
        codes: d.codes ?? [],
        conditions: d.conditions ?? [],
        appliesToAllProducts: d.appliesToAllProducts,
        appliesToAllCustomers: d.appliesToAllCustomers,
        targetedProducts: (d.targetedProducts ?? []).map((p: { product?: { id: string; title: string }; id?: string; title?: string }) => ({
          id: p.product?.id ?? p.id ?? "",
          title: p.product?.title ?? p.title ?? "",
        })),
        targetedCollections: (d.targetedCollections ?? []).map((c: { collection?: { id: string; title: string }; id?: string; title?: string }) => ({
          id: c.collection?.id ?? c.id ?? "",
          title: c.collection?.title ?? c.title ?? "",
        })),
        targetedSegments: (d.targetedSegments ?? []).map((s: { segment?: { id: string; name: string }; id?: string; name?: string }) => ({
          id: s.segment?.id ?? s.id ?? "",
          name: s.segment?.name ?? s.name ?? "",
        })),
        targetedCustomers: (d.targetedCustomers ?? []).map((c: { guestAccount?: { id: string; email: string }; id?: string; email?: string }) => ({
          id: c.guestAccount?.id ?? c.id ?? "",
          label: c.guestAccount?.email ?? c.email ?? "",
        })),
      });
    }
    setLoading(false);
  }, [discountId]);

  useEffect(() => { fetchDiscount(); }, [fetchDiscount]);

  if (loading) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div style={{ padding: 48, display: "flex", justifyContent: "center" }}>
            <Loading variant="section" />
          </div>
        </div>
      </div>
    );
  }

  if (!discount) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px" }}>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Rabatten hittades inte</p>
            <button className="settings-btn--connect" onClick={() => router.push("/discounts")}>Tillbaka</button>
          </div>
        </div>
      </div>
    );
  }

  return <DiscountForm discount={discount} discountType={resolveDiscountType(discount)} />;
}
