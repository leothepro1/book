"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Loading } from "@/app/_components/Loading/Loading";
import "../../discounts.css";
import type { DiscountStatus, DiscountMethod, DiscountValueType, DiscountTargetType } from "@prisma/client";

type DiscountEdit = {
  id: string;
  title: string;
  description: string | null;
  method: DiscountMethod;
  valueType: DiscountValueType;
  value: number;
  targetType: DiscountTargetType;
  status: DiscountStatus;
  endsAt: string | null;
  usageLimit: number | null;
  combinesWithProductDiscounts: boolean;
  combinesWithOrderDiscounts: boolean;
  combinesWithShippingDiscounts: boolean;
};

function formatValue(vt: DiscountValueType, v: number): string {
  if (vt === "PERCENTAGE") return `${v / 100}%`;
  return `${v / 100} kr`;
}

export default function EditDiscountPage() {
  const { discountId } = useParams<{ discountId: string }>();
  const router = useRouter();
  const [discount, setDiscount] = useState<DiscountEdit | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [hasEndDate, setHasEndDate] = useState(false);
  const [usageLimit, setUsageLimit] = useState("");
  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [combinesProduct, setCombinesProduct] = useState(false);
  const [combinesOrder, setCombinesOrder] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiscount = useCallback(async () => {
    const res = await fetch(`/api/admin/discounts/${discountId}`);
    if (res.ok) {
      const d = await res.json();
      setDiscount(d);
      setTitle(d.title);
      setDescription(d.description ?? "");
      setHasEndDate(!!d.endsAt);
      setEndsAt(d.endsAt ? new Date(d.endsAt).toISOString().slice(0, 16) : "");
      setHasUsageLimit(d.usageLimit !== null);
      setUsageLimit(d.usageLimit ? String(d.usageLimit) : "");
      setCombinesProduct(d.combinesWithProductDiscounts);
      setCombinesOrder(d.combinesWithOrderDiscounts);
    }
    setLoading(false);
  }, [discountId]);

  useEffect(() => { fetchDiscount(); }, [fetchDiscount]);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = { title };
    if (description !== (discount?.description ?? "")) body.description = description || null;
    body.endsAt = hasEndDate && endsAt ? new Date(endsAt).toISOString() : null;
    body.usageLimit = hasUsageLimit && usageLimit ? parseInt(usageLimit, 10) : null;
    body.combinesWithProductDiscounts = combinesProduct;
    body.combinesWithOrderDiscounts = combinesOrder;

    try {
      const res = await fetch(`/api/admin/discounts/${discountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push(`/discounts/${discountId}`);
      } else {
        const data = await res.json();
        setError(data.message || data.error || "Något gick fel");
      }
    } catch {
      setError("Nätverksfel — försök igen");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page admin-page--no-preview discounts-page">
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
      <div className="admin-page admin-page--no-preview discounts-page">
        <div className="admin-editor">
          <div className="disc-empty">
            <p className="disc-empty__title">Rabatten hittades inte</p>
            <Link href="/discounts" className="settings-btn--connect">Tillbaka</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--no-preview discounts-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href={`/discounts/${discountId}`} style={{ display: "flex", color: "var(--admin-text-secondary)" }}>
              <EditorIcon name="arrow_back" size={20} />
            </Link>
            Redigera rabatt
          </h1>
        </div>
        <div className="admin-content">
          <div className="disc-form">
            {/* Read-only fields */}
            <div className="disc-form__section">
              <div className="disc-form__section-title">Kan inte ändras</div>
              <div className="disc-form__field">
                <label className="disc-form__label">Metod</label>
                <input className="disc-form__input disc-form__input--readonly" value={discount.method === "CODE" ? "Rabattkod" : "Automatisk"} readOnly />
              </div>
              <div className="disc-form__field">
                <label className="disc-form__label">Värde</label>
                <input className="disc-form__input disc-form__input--readonly" value={formatValue(discount.valueType, discount.value)} readOnly />
              </div>
              <div className="disc-form__field">
                <label className="disc-form__label">Mål</label>
                <input className="disc-form__input disc-form__input--readonly" value={discount.targetType === "ORDER" ? "Hela ordern" : "Specifika produkter"} readOnly />
              </div>
            </div>

            {/* Editable fields */}
            <div className="disc-form__section">
              <div className="disc-form__section-title">Redigerbara fält</div>

              <div className="disc-form__field">
                <label className="disc-form__label">Rubrik</label>
                <input
                  className="disc-form__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="disc-form__field">
                <label className="disc-form__label">Beskrivning</label>
                <input
                  className="disc-form__input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Valfri beskrivning"
                />
              </div>

              <label className="disc-form__checkbox-row">
                <input type="checkbox" checked={hasEndDate} onChange={(e) => setHasEndDate(e.target.checked)} />
                Slutdatum
              </label>
              {hasEndDate && (
                <div className="disc-form__field">
                  <input
                    className="disc-form__input"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              )}

              <label className="disc-form__checkbox-row">
                <input type="checkbox" checked={hasUsageLimit} onChange={(e) => setHasUsageLimit(e.target.checked)} />
                Begränsa antal användningar
              </label>
              {hasUsageLimit && (
                <div className="disc-form__field">
                  <input
                    className="disc-form__input"
                    type="number"
                    min="1"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value)}
                    style={{ maxWidth: 200 }}
                  />
                </div>
              )}
            </div>

            {/* Combinations */}
            <div className="disc-form__section">
              <div className="disc-form__section-title">Kombinationer</div>
              <label className="disc-form__checkbox-row">
                <input type="checkbox" checked={combinesProduct} onChange={(e) => setCombinesProduct(e.target.checked)} />
                Kombineras med produktrabatter
              </label>
              <label className="disc-form__checkbox-row">
                <input type="checkbox" checked={combinesOrder} onChange={(e) => setCombinesOrder(e.target.checked)} />
                Kombineras med orderrabatter
              </label>
            </div>

            {error && <div className="disc-form__error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <Link href={`/discounts/${discountId}`} className="settings-btn--outline">
                Avbryt
              </Link>
              <button
                className="settings-btn--connect"
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                type="button"
              >
                {submitting ? "Sparar..." : "Spara ändringar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
