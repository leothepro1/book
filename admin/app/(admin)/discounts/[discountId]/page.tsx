"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DiscountStatusBadge } from "../_components/DiscountStatusBadge";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Loading } from "@/app/_components/Loading/Loading";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "../discounts.css";
import "../../orders/orders.css";
import type { DiscountStatus, DiscountMethod, DiscountValueType, DiscountTargetType, DiscountConditionType, DiscountEventType } from "@prisma/client";

type DiscountDetail = {
  id: string;
  title: string;
  description: string | null;
  method: DiscountMethod;
  valueType: DiscountValueType;
  value: number;
  targetType: DiscountTargetType;
  status: DiscountStatus;
  startsAt: string;
  endsAt: string | null;
  usageCount: number;
  usageLimit: number | null;
  combinesWithProductDiscounts: boolean;
  combinesWithOrderDiscounts: boolean;
  combinesWithShippingDiscounts: boolean;
  createdAt: string;
  codes: { id: string; code: string; usageCount: number; usageLimit: number | null; isActive: boolean }[];
  conditions: { id: string; type: DiscountConditionType; intValue: number | null; stringValue: string | null; jsonValue: unknown }[];
  _count: { usages: number };
  events: { id: string; type: DiscountEventType; message: string; createdAt: string; actorUserId: string | null; actorName: string | null }[];
  usages: { id: string; guestEmail: string; discountAmount: number; createdAt: string; orderId: string }[];
};

function formatValue(vt: DiscountValueType, v: number): string {
  if (vt === "PERCENTAGE") return `${v / 100}%`;
  return `${formatPriceDisplay(v, "SEK")} kr`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function conditionText(c: DiscountDetail["conditions"][number]): string {
  switch (c.type) {
    case "MIN_NIGHTS": return `Minst ${c.intValue ?? 0} nätter`;
    case "DAYS_IN_ADVANCE": return `Bokning minst ${c.intValue ?? 0} dagar före ankomst`;
    case "ARRIVAL_WINDOW": {
      const jv = c.jsonValue as { startsAt?: string; endsAt?: string } | null;
      return `Ankomst mellan ${jv?.startsAt ?? "?"} och ${jv?.endsAt ?? "?"}`;
    }
    case "MIN_ORDER_AMOUNT": return `Minsta ordersumma ${formatPriceDisplay(c.intValue ?? 0, "SEK")} kr`;
    case "MIN_ITEMS": return `Minst ${c.intValue ?? 0} produkter`;
    case "ONCE_PER_CUSTOMER": return "En gång per kund";
    case "SPECIFIC_PRODUCTS": return "Specifika produkter";
    case "CUSTOMER_SEGMENT": return `Kundsegment: ${c.stringValue ?? "?"}`;
    default: return String(c.type);
  }
}

export default function DiscountDetailPage() {
  const { discountId } = useParams<{ discountId: string }>();
  const router = useRouter();
  const [discount, setDiscount] = useState<DiscountDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Add codes
  const [newCode, setNewCode] = useState("");
  const [addingCode, setAddingCode] = useState(false);

  // Comment
  const [comment, setComment] = useState("");
  const [commentPending, setCommentPending] = useState(false);

  const fetchDiscount = useCallback(async () => {
    const res = await fetch(`/api/admin/discounts/${discountId}`);
    if (res.ok) {
      setDiscount(await res.json());
    }
    setLoading(false);
  }, [discountId]);

  useEffect(() => { fetchDiscount(); }, [fetchDiscount]);

  const toggleStatus = async () => {
    if (!discount) return;
    const newStatus = discount.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const res = await fetch(`/api/admin/discounts/${discountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchDiscount();
  };

  const deactivateCode = async (codeId: string) => {
    await fetch(`/api/admin/discounts/${discountId}/codes/${codeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    fetchDiscount();
  };

  const addCodes = async () => {
    const trimmed = newCode.trim().toUpperCase();
    if (!trimmed) return;
    setAddingCode(true);
    const res = await fetch(`/api/admin/discounts/${discountId}/codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: [trimmed] }),
    });
    if (res.ok) {
      setNewCode("");
      fetchDiscount();
    }
    setAddingCode(false);
  };

  const submitComment = async () => {
    if (!comment.trim() || commentPending) return;
    setCommentPending(true);
    const res = await fetch(`/api/admin/discounts/${discountId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: comment.trim() }),
    });
    if (res.ok) {
      setComment("");
      fetchDiscount();
    }
    setCommentPending(false);
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
            <Link href="/discounts" style={{ display: "flex", color: "var(--admin-text-secondary)" }}>
              <EditorIcon name="arrow_back" size={20} />
            </Link>
            {discount.title}
          </h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DiscountStatusBadge status={discount.status} />
            <Link href={`/discounts/${discountId}/edit`} className="settings-btn--outline">
              Redigera
            </Link>
            <button
              className={discount.status === "ACTIVE" ? "admin-btn--danger-secondary" : "settings-btn--connect"}
              onClick={toggleStatus}
              style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8 }}
            >
              {discount.status === "ACTIVE" ? "Avaktivera" : "Aktivera"}
            </button>
          </div>
        </div>

        <div className="admin-content">
          <div className="disc-detail">
            {/* Summary card */}
            <div className="disc-card">
              <div className="disc-card__title">Sammanfattning</div>
              <div className="disc-card__row">
                <span className="disc-card__label">Metod</span>
                <span className="disc-card__value">{discount.method === "CODE" ? "Rabattkod" : "Automatisk"}</span>
              </div>
              <div className="disc-card__row">
                <span className="disc-card__label">Värde</span>
                <span className="disc-card__value">{formatValue(discount.valueType, discount.value)}</span>
              </div>
              <div className="disc-card__row">
                <span className="disc-card__label">Mål</span>
                <span className="disc-card__value">{discount.targetType === "ORDER" ? "Hela ordern" : "Specifika produkter"}</span>
              </div>
              <div className="disc-card__row">
                <span className="disc-card__label">Giltighet</span>
                <span className="disc-card__value">
                  {formatDate(discount.startsAt)}
                  {discount.endsAt ? ` — ${formatDate(discount.endsAt)}` : " — Inget slutdatum"}
                </span>
              </div>
              <div className="disc-card__row">
                <span className="disc-card__label">Användningar</span>
                <span className="disc-card__value">
                  {discount.usageCount}{discount.usageLimit ? ` / ${discount.usageLimit}` : " / \u221E"}
                </span>
              </div>
              {discount.description && (
                <div className="disc-card__row">
                  <span className="disc-card__label">Beskrivning</span>
                  <span className="disc-card__value">{discount.description}</span>
                </div>
              )}
            </div>

            {/* Conditions */}
            {discount.conditions.length > 0 && (
              <div className="disc-card">
                <div className="disc-card__title">Villkor</div>
                <div className="disc-conditions">
                  {discount.conditions.map((c) => (
                    <div key={c.id} className="disc-condition">
                      <EditorIcon name="check_circle" size={16} className="disc-condition__icon" />
                      {conditionText(c)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Codes */}
            {discount.method === "CODE" && (
              <div className="disc-card">
                <div className="disc-card__title">Koder</div>
                <div className="disc-codes">
                  <div className="disc-codes__row" style={{ fontWeight: 500, fontSize: 12, color: "var(--admin-text-secondary)" }}>
                    <span>Kod</span>
                    <span>Användningar</span>
                    <span>Gräns</span>
                    <span>Status</span>
                    <span></span>
                  </div>
                  {discount.codes.map((c) => (
                    <div key={c.id} className="disc-codes__row">
                      <span className="disc-codes__code">{c.code}</span>
                      <span>{c.usageCount}</span>
                      <span>{c.usageLimit ?? "\u221E"}</span>
                      <span>
                        <span style={{
                          background: c.isActive ? "#C8F4D6" : "#E8E8E8",
                          color: c.isActive ? "#0D5626" : "#616161",
                          borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 500,
                        }}>
                          {c.isActive ? "Aktiv" : "Inaktiv"}
                        </span>
                      </span>
                      <span>
                        {c.isActive && (
                          <button
                            onClick={() => deactivateCode(c.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--admin-text-secondary)" }}
                          >
                            <EditorIcon name="block" size={16} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Add code */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                    className="disc-form__input"
                    placeholder="Ny kod"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCodes(); } }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="settings-btn--connect"
                    onClick={addCodes}
                    disabled={addingCode || !newCode.trim()}
                    type="button"
                  >
                    Lägg till
                  </button>
                </div>
              </div>
            )}

            {/* Recent usages */}
            {discount.usages.length > 0 && (
              <div className="disc-card">
                <div className="disc-card__title">Senaste användningar</div>
                <div className="disc-codes">
                  <div className="disc-codes__row" style={{ fontWeight: 500, fontSize: 12, color: "var(--admin-text-secondary)", gridTemplateColumns: "1fr 2fr 1fr 1fr" }}>
                    <span>Datum</span>
                    <span>Gäst</span>
                    <span>Rabatt</span>
                    <span>Order</span>
                  </div>
                  {discount.usages.map((u) => (
                    <div key={u.id} className="disc-codes__row" style={{ gridTemplateColumns: "1fr 2fr 1fr 1fr" }}>
                      <span style={{ fontSize: 12, color: "var(--admin-text-secondary)" }}>{formatDate(u.createdAt)}</span>
                      <span>{u.guestEmail}</span>
                      <span>{formatPriceDisplay(u.discountAmount, "SEK")} kr</span>
                      <span>
                        <Link href={`/orders/${u.orderId}`} style={{ color: "var(--admin-accent)" }}>
                          Visa
                        </Link>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline — reuses .ord-tl-* pattern from orders */}
            <div className="disc-card">
              <div className="disc-card__title">Tidslinje</div>

              {/* Comment input */}
              <div className="ord-tl-comment">
                <div className="ord-tl-comment__body">
                  <div className="ord-tl-comment__input-wrap">
                    <div className="ord-tl-comment__avatar">
                      <EditorIcon name="person" size={18} />
                    </div>
                    <div className="ord-tl-comment__input-row">
                      <textarea
                        className="ord-tl-comment__input"
                        placeholder="Lägg till en kommentar…"
                        value={comment}
                        onChange={(e) => setComment(e.currentTarget.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) submitComment(); }}
                        rows={1}
                      />
                    </div>
                  </div>
                  <div className="ord-tl-comment__toolbar">
                    <div className="ord-tl-comment__tools" />
                    <button
                      type="button"
                      className={`ord-tl-comment__publish${comment.trim() ? " ord-tl-comment__publish--active" : ""}`}
                      disabled={!comment.trim() || commentPending}
                      onClick={submitComment}
                    >
                      Publicera
                    </button>
                  </div>
                </div>
              </div>
              <div className="ord-tl-comment__hint">Endast du och annan personal kan se kommentarer</div>

              {/* Events grouped by date */}
              <div className="ord-tl-track">
                {(() => {
                  const groups: { date: string; label: string; events: typeof discount.events }[] = [];
                  for (const event of discount.events) {
                    const d = new Date(event.createdAt);
                    const dateKey = d.toISOString().slice(0, 10);
                    const label = d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
                    const last = groups[groups.length - 1];
                    if (last && last.date === dateKey) {
                      last.events.push(event);
                    } else {
                      groups.push({ date: dateKey, label, events: [event] });
                    }
                  }

                  return groups.map((group) => (
                    <div key={group.date} className="ord-tl-group">
                      <div className="ord-tl-group__date">{group.label}</div>
                      {group.events.map((event) => {
                        const isComment = event.type === "NOTE_ADDED";
                        const staffName = event.actorName ?? null;
                        const time = new Date(event.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

                        if (isComment) {
                          return (
                            <div key={event.id} className="ord-tl-event">
                              <div className="ord-tl-event__dot" />
                              <div className="ord-tl-comment-card">
                                <div className="ord-tl-comment-card__header">
                                  <div className="ord-tl-comment-card__avatar">
                                    <EditorIcon name="person" size={18} />
                                  </div>
                                  <div className="ord-tl-comment-card__meta">
                                    <div className="ord-tl-comment-card__name-row">
                                      <span className="ord-tl-comment-card__name">{staffName ?? "Personal"}</span>
                                      <span className="ord-tl-comment-card__time">{time}</span>
                                    </div>
                                    <div className="ord-tl-comment-card__body">{event.message}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={event.id} className="ord-tl-event">
                            <div className="ord-tl-event__dot" />
                            <div className="ord-tl-event__body">
                              {staffName && <span className="ord-tl-event__actor">{staffName} · </span>}
                              <span>{event.message}</span>
                            </div>
                            <span className="ord-tl-event__time">{time}</span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
