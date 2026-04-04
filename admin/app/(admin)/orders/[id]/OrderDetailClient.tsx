"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOrderFormat } from "@/app/(admin)/_hooks/useOrderFormat";
import { getOrder, fulfillOrder, cancelOrder, addOrderComment, updateCustomerNote, updateOrderTags, archiveOrder, unarchiveOrder, deleteOrder, type OrderDetail } from "../actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { getOrganisationUsers, type OrgUser } from "@/app/(admin)/settings/users/actions";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useUser } from "@clerk/nextjs";
import { OrderBadge } from "@/app/(admin)/_components/orders/OrderBadge";
import type { OrderFinancialStatus, OrderFulfillmentStatus } from "@prisma/client";
import "../../products/_components/product-form.css";
import "../orders.css";

const IS_DEV = process.env.NODE_ENV === "development";

// ── Helpers ──────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const CARD_NO_PAD: React.CSSProperties = { ...CARD, padding: 0 };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

const EVENT_ICONS: Record<string, string> = {
  ORDER_CREATED: "add_circle",
  ORDER_CONFIRMED: "check_circle",
  ORDER_UPDATED: "edit",
  ORDER_CANCELLED: "cancel",
  ORDER_REOPENED: "undo",
  PAYMENT_AUTHORIZED: "lock",
  PAYMENT_CAPTURED: "payments",
  PAYMENT_FAILED: "error",
  PAYMENT_VOIDED: "block",
  REFUND_INITIATED: "undo",
  REFUND_SUCCEEDED: "undo",
  REFUND_FAILED: "error",
  ORDER_FULFILLED: "check_circle",
  ORDER_UNFULFILLED: "undo",
  INVENTORY_RELEASED: "inventory",
  EMAIL_SENT: "mail",
  NOTE_ADDED: "note",
  RECONCILED: "sync",
  GUEST_INFO_UPDATED: "person",
};

const CHANNEL_LABELS: Record<string, string> = {
  direct: "Webbshop",
  booking_com: "Booking.com",
  expedia: "Expedia",
};

// ── Component ────────────────────────────────────────────────

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const fmtOrder = useOrderFormat();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const clerkUser = IS_DEV ? null : useUser().user;
  const avatarUrl = clerkUser?.imageUrl ?? null;
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<"cancel" | "delete" | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [tagInput, setTagInput] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<OrgUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionedStaff, setMentionedStaff] = useState<OrgUser[]>([]);
  const mentionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOrder(orderId).then(setOrder).finally(() => setLoading(false));
  }, [orderId]);

  const handleFulfill = () => {
    setError(null);
    startTransition(async () => {
      const result = await fulfillOrder(orderId);
      if (!result.ok) { setError(result.error); return; }
      setOrder(await getOrder(orderId));
    });
  };

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (!result.ok) { setError(result.error); return; }
      setOrder(await getOrder(orderId));
    });
  };

  // Close actions dropdown on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handle = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [actionsOpen]);

  // Close mention popup on outside click
  useEffect(() => {
    if (!mentionOpen) return;
    const handle = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) setMentionOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [mentionOpen]);

  const openMentionPicker = async () => {
    if (mentionOpen) { setMentionOpen(false); return; }
    setMentionOpen(true);
    if (mentionUsers.length === 0 && !mentionLoading) {
      setMentionLoading(true);
      const users = await getOrganisationUsers();
      setMentionUsers(users.filter((u) => u.status === "active"));
      setMentionLoading(false);
    }
  };

  const addMention = (user: OrgUser) => {
    if (mentionedStaff.some((s) => s.id === user.id)) return;
    setMentionedStaff((prev) => [...prev, user]);
    setMentionOpen(false);
  };

  const removeMention = (userId: string) => {
    setMentionedStaff((prev) => prev.filter((s) => s.id !== userId));
  };

  const buildCommentText = () => {
    const mentions = mentionedStaff.map((s) => `@${[s.firstName, s.lastName].filter(Boolean).join(" ")}`).join(" ");
    const text = comment.trim();
    return mentions ? `${mentions} ${text}` : text;
  };

  const submitComment = async () => {
    const full = buildCommentText();
    if (!full || commentPending) return;
    setCommentPending(true);
    const res = await addOrderComment(orderId, full);
    if (res.ok) {
      setComment("");
      setMentionedStaff([]);
      const el = document.querySelector<HTMLTextAreaElement>(".ord-tl-comment__input");
      if (el) el.style.height = "auto";
      setOrder(await getOrder(orderId));
    }
    setCommentPending(false);
  };

  if (loading) return null;

  if (!order) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div className="admin-header pf-header">
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/orders")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inbox</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>Ordern hittades inte</span>
            </h1>
          </div>
        </div>
      </div>
    );
  }

  const fin = order.financialStatus as OrderFinancialStatus;
  const ful = order.fulfillmentStatus as OrderFulfillmentStatus;
  const channelName = CHANNEL_LABELS[order.sourceChannel ?? "direct"] ?? order.sourceChannel ?? "Webbshop";
  const createdDate = new Date(order.createdAt);
  const subtitle = `${createdDate.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })} kl ${createdDate.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })} från ${channelName}`;

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* Header */}
        <div className="admin-header pf-header">
          <div>
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/orders")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inbox</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>{fmtOrder(order.orderNumber)}</span>
              <span className="pf-header__actions" style={{ marginLeft: 8 }}>
                <OrderBadge type="financial" financial={fin} fulfillment={ful} />
                <OrderBadge type="fulfillment" fulfillment={ful} />
              </span>
            </h1>
            <div className="ord-header-subtitle">{subtitle}</div>
          </div>
          <div className="ord-header-actions">
            {/* Fler åtgärder */}
            <div className="ord-header-actions__more" ref={actionsRef}>
              <button
                type="button"
                className="ord-header-actions__btn"
                onClick={() => setActionsOpen((v) => !v)}
              >
                Fler åtgärder
                <EditorIcon name="expand_more" size={18} />
              </button>
              {actionsOpen && (
                <div className="ord-header-actions__dropdown">
                  {order.status !== "CANCELLED" && (
                    <button
                      type="button"
                      className="ord-header-actions__dropdown-item"
                      onClick={() => { setActionsOpen(false); setConfirmModal("cancel"); }}
                    >
                      <EditorIcon name="block" size={16} />
                      Annulera order
                    </button>
                  )}
                  <button
                    type="button"
                    className="ord-header-actions__dropdown-item"
                    onClick={async () => {
                      setActionsOpen(false);
                      const res = order.archivedAt
                        ? await unarchiveOrder(orderId)
                        : await archiveOrder(orderId);
                      if (res.ok) setOrder(await getOrder(orderId));
                      else setError("error" in res ? res.error : "Något gick fel");
                    }}
                  >
                    <EditorIcon name={order.archivedAt ? "unarchive" : "archive"} size={16} />
                    {order.archivedAt ? "Avarkivera" : "Arkivera"}
                  </button>
                  {order.status === "CANCELLED" && (
                    <button
                      type="button"
                      className="ord-header-actions__dropdown-item ord-header-actions__dropdown-item--danger"
                      onClick={() => { setActionsOpen(false); setConfirmModal("delete"); }}
                    >
                      <EditorIcon name="delete" size={16} />
                      Ta bort order
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Prev / Next */}
            <button
              type="button"
              className="ord-header-actions__nav"
              disabled={!order.prevOrderId}
              onClick={() => order.prevOrderId && router.push(`/orders/${order.prevOrderId}`)}
              aria-label="Föregående order"
            >
              <EditorIcon name="expand_less" size={18} />
            </button>
            <button
              type="button"
              className="ord-header-actions__nav"
              disabled={!order.nextOrderId}
              onClick={() => order.nextOrderId && router.push(`/orders/${order.nextOrderId}`)}
              aria-label="Nästa order"
            >
              <EditorIcon name="expand_more" size={18} />
            </button>
          </div>
        </div>

        {/* Confirm modal */}
        {confirmModal && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => !isPending && setConfirmModal(null)}
          >
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 24px 48px rgba(0,0,0,0.16)", width: 480, maxWidth: "90vw", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--admin-border)", background: "#f3f3f4" }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-text)" }}>
                  {confirmModal === "cancel" ? "Annulera order?" : "Ta bort order?"}
                </span>
                <button
                  type="button"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "none", borderRadius: 6, background: "none", color: "var(--admin-text-tertiary)", cursor: "pointer" }}
                  onClick={() => !isPending && setConfirmModal(null)}
                >
                  <EditorIcon name="close" size={18} />
                </button>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: "var(--font-sm)", color: "#616161", lineHeight: 1.5 }}>
                  {confirmModal === "cancel"
                    ? "Ordern kommer att annuleras och eventuella lagerreservationer frigörs. Denna åtgärd kan inte ångras."
                    : "Ordern och all tillhörande data raderas permanent. Denna åtgärd kan inte ångras."}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--admin-border)" }}>
                <button className="admin-btn admin-btn--ghost" style={{ padding: "5px 10px", borderRadius: 8 }} onClick={() => setConfirmModal(null)} disabled={isPending}>
                  Avbryt
                </button>
                <button
                  className="admin-btn admin-btn--danger"
                  style={{ padding: "5px 10px", borderRadius: 8 }}
                  disabled={isPending}
                  onClick={async () => {
                    if (confirmModal === "cancel") {
                      handleCancel();
                      setConfirmModal(null);
                    } else {
                      startTransition(async () => {
                        const res = await deleteOrder(orderId);
                        if (res.ok) {
                          router.push("/orders");
                        } else {
                          setError(res.error);
                          setConfirmModal(null);
                        }
                      });
                    }
                  }}
                >
                  {isPending ? "Vänta..." : confirmModal === "cancel" ? "Annulera" : "Ta bort"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="pf-error-banner">
            <EditorIcon name="error" size={16} />
            {error}
            <button className="pf-error-banner__close" onClick={() => setError(null)}>
              <EditorIcon name="close" size={14} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="pf-body">
          {/* ── Main column ─────────────────────────────── */}
          <div className="pf-main">

            {/* Produkter */}
            <div style={CARD} className="ord-products-container">
              <div className="ord-container-badge-row">
                <OrderBadge type="fulfillment" fulfillment={ful} />
                {order.fulfilledAt && <span className="ord-container-badge-date">Levererad {formatShortDate(order.fulfilledAt)}</span>}
                {order.cancelledAt && !order.fulfilledAt && <span className="ord-container-badge-date">Avbokad {formatShortDate(order.cancelledAt)}</span>}
                {order.financialStatus === "PAID" && order.fulfillmentStatus === "UNFULFILLED" && (
                  <button className="admin-btn admin-btn--accent" style={{ marginLeft: "auto", fontSize: 12, padding: "4px 12px" }} onClick={handleFulfill} disabled={isPending}>
                    Markera som levererad
                  </button>
                )}
              </div>
              {order.lineItems.map((item, itemIndex) => {
                const meta = order.metadata;
                const isAccommodation = itemIndex === 0; // First line item is always the accommodation
                const checkIn = meta?.checkIn as string | undefined;
                const checkOut = meta?.checkOut as string | undefined;
                const guests = meta?.guests as number | undefined;
                const nights = meta?.nights as number | undefined;
                const ratePlanName = isAccommodation ? ((meta?.ratePlanName as string) ?? item.variantTitle) : item.variantTitle;
                const isExpanded = expandedItems.has(item.id);

                const details: { label: string; value: string }[] = [];
                if (isAccommodation) {
                  if (checkIn && checkOut) {
                    details.push({
                      label: "Datum",
                      value: `${new Date(checkIn).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} – ${new Date(checkOut).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}`,
                    });
                  }
                  if (nights != null) details.push({ label: "Nätter", value: String(nights) });
                  if (guests != null) details.push({ label: "Gäster", value: String(guests) });
                }
                details.push({ label: "Antal", value: String(item.quantity) });
                if (item.sku) details.push({ label: "SKU", value: item.sku });

                return (
                  <div key={item.id} className="ord-product-card">
                    <div className="ord-product-header">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="ord-product-header__img" />
                      ) : (
                        <div className="ord-product-header__img ord-product-header__img--empty">
                          <EditorIcon name="image" size={24} />
                        </div>
                      )}
                      <div className="ord-product-header__info">
                        <div className="ord-product-header__title">{item.title}</div>
                        {ratePlanName && (
                          <div className="ord-product-header__plan">{ratePlanName}</div>
                        )}
                      </div>
                    </div>

                    <div className="ord-product-details">
                      <button
                        type="button"
                        className="ord-product-details-toggle"
                        onClick={() => setExpandedItems((prev) => {
                          const next = new Set(prev);
                          next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                          return next;
                        })}
                      >
                        <span className="ord-product-details-toggle__summary">
                          {isExpanded
                            ? `${details[0].label}: ${details[0].value}`
                            : details.map((d) => `${d.label}: ${d.value}`).join(" • ")
                          }
                        </span>
                        <EditorIcon
                          name="expand_more"
                          size={18}
                          className={`ord-product-details-toggle__chevron${isExpanded ? " ord-product-details-toggle__chevron--open" : ""}`}
                        />
                      </button>
                      <div className={`ord-product-details__expandable${isExpanded ? " ord-product-details__expandable--open" : ""}`}>
                        <div className="ord-product-details__expandable-inner">
                          {details.slice(1).map((d) => (
                            <div key={d.label} className="ord-product-details__row">
                              {d.label}: <span className={`ord-product-details__value${d.label === "SKU" ? " ord-product-details__value--mono" : ""}`}>{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Betalning */}
            {(() => {
              const paid = order.payment?.status === "RESOLVED" ? order.payment.amount : 0;
              const refunded = order.financialStatus === "REFUNDED" ? order.totalAmount
                : order.financialStatus === "PARTIALLY_REFUNDED" ? order.totalAmount - paid
                : 0;
              const netPaid = paid - refunded;

              return (
                <div style={CARD}>
                  <div className="ord-container-badge-row" style={{ marginBottom: 12 }}>
                    <OrderBadge type="financial" financial={fin} fulfillment={ful} />
                    {order.paidAt && <span className="ord-container-badge-date">Betald {formatShortDate(order.paidAt)}</span>}
                    {order.refundedAt && <span className="ord-container-badge-date">Återbetald {formatShortDate(order.refundedAt)}</span>}
                  </div>
                  <div className="ord-payment-card">
                    <div className="ord-payment__row">
                      <span>Delsumma</span>
                      <span>{formatPriceDisplay(order.subtotalAmount, order.currency)} kr</span>
                    </div>
                    {order.taxAmount > 0 && (
                      <div className="ord-payment__row">
                        <span>Skatt</span>
                        <span>{formatPriceDisplay(order.taxAmount, order.currency)} kr</span>
                      </div>
                    )}
                    {order.taxAmount === 0 && (
                      <div className="ord-payment__row">
                        <span>Skatt</span>
                        <span className="ord-payment__muted">Inkl. moms</span>
                      </div>
                    )}
                    <div className="ord-payment__row ord-payment__row--total">
                      <span>Totalt</span>
                      <span>{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
                    </div>

                    <div className="ord-payment__divider" />

                    <div className="ord-payment__row">
                      <span className="ord-payment__paid-label">
                        Betalt
                        {order.payment?.resolvedAt && (
                          <span className="ord-payment__paid-date">
                            {new Date(order.payment.resolvedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </span>
                      <span>{formatPriceDisplay(paid, order.currency)} kr</span>
                    </div>
                    {refunded > 0 && (
                      <div className="ord-payment__row">
                        <span>Återbetalt</span>
                        <span>−{formatPriceDisplay(refunded, order.currency)} kr</span>
                      </div>
                    )}
                    {refunded > 0 && (
                      <div className="ord-payment__row ord-payment__row--total">
                        <span>Netto betalt</span>
                        <span>{formatPriceDisplay(netPaid, order.currency)} kr</span>
                      </div>
                    )}
                    {order.totalAmount > 0 && paid === 0 && order.financialStatus === "PENDING" && (
                      <div className="ord-payment__row">
                        <span>Utestående</span>
                        <span className="ord-payment__outstanding">{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Tidslinje */}
            <div className="ord-tl">
              {/* Kommentarsfält */}
              <div className="ord-tl-comment">
                <div className="ord-tl-comment__body">
                  <div className="ord-tl-comment__input-wrap">
                    <div className="ord-tl-comment__avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="ord-tl-comment__avatar-img" />
                      ) : (
                        <EditorIcon name="person" size={16} />
                      )}
                    </div>
                    <div className="ord-tl-comment__input-row">
                      {mentionedStaff.map((s) => (
                        <span key={s.id} className="ord-mention-pill">
                          {s.hasImage && s.imageUrl ? (
                            <img src={s.imageUrl} alt="" className="ord-mention-pill__avatar" />
                          ) : (
                            <span className="ord-mention-pill__avatar ord-mention-pill__avatar--empty">
                              <EditorIcon name="person" size={12} />
                            </span>
                          )}
                          {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.email}
                          <button type="button" className="ord-mention-pill__remove" onClick={() => removeMention(s.id)} aria-label="Ta bort">
                            <EditorIcon name="close" size={10} />
                          </button>
                        </span>
                      ))}
                      <textarea
                        className="ord-tl-comment__input"
                        placeholder={mentionedStaff.length > 0 ? "" : "Lämna en kommentar..."}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={1}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitComment();
                          }
                        }}
                        onInput={(e) => {
                          const el = e.currentTarget;
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }}
                      />
                    </div>
                  </div>
                  <div className="ord-tl-comment__toolbar">
                    <div className="ord-tl-comment__tools">
                      <div className="ord-mention-wrap" ref={mentionRef}>
                        <button type="button" className={`ord-tl-comment__tool${mentionOpen ? " ord-tl-comment__tool--active" : ""}`} title="Tagga personal" onClick={openMentionPicker}>
                          <EditorIcon name="alternate_email" size={18} />
                        </button>
                        {mentionOpen && (
                          <div className="ord-mention-dropdown">
                            {mentionLoading ? (
                              <div className="ord-mention-dropdown__loading">Laddar...</div>
                            ) : mentionUsers.length === 0 ? (
                              <div className="ord-mention-dropdown__loading">Inga användare</div>
                            ) : (
                              mentionUsers.map((u) => {
                                const alreadyMentioned = mentionedStaff.some((s) => s.id === u.id);
                                const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    className={`ord-mention-dropdown__item${alreadyMentioned ? " ord-mention-dropdown__item--disabled" : ""}`}
                                    disabled={alreadyMentioned}
                                    onClick={() => addMention(u)}
                                  >
                                    <div className="ord-mention-dropdown__avatar">
                                      {u.hasImage && u.imageUrl ? (
                                        <img src={u.imageUrl} alt="" />
                                      ) : (
                                        <EditorIcon name="person" size={14} />
                                      )}
                                    </div>
                                    <div className="ord-mention-dropdown__info">
                                      <span className="ord-mention-dropdown__name">{displayName}</span>
                                      <span className="ord-mention-dropdown__role">{u.roleName}</span>
                                    </div>
                                    {alreadyMentioned && <EditorIcon name="check" size={16} style={{ color: "var(--admin-accent)", marginLeft: "auto" }} />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`ord-tl-comment__publish${(comment.trim() || mentionedStaff.length > 0) ? " ord-tl-comment__publish--active" : ""}`}
                      disabled={(!comment.trim() && mentionedStaff.length === 0) || commentPending}
                      onClick={submitComment}
                    >
                      Publicera
                    </button>
                  </div>
                </div>
                <div className="ord-tl-comment__hint">Endast du och annan personal kan se kommentarer</div>
              </div>

              {/* Events grouped by date */}
              <div className="ord-tl-track">
              {(() => {
                const groups: { date: string; label: string; events: typeof order.events }[] = [];
                for (const event of order.events) {
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
                      const isEmail = event.type === "EMAIL_SENT";
                      const isDiagnostic = event.type === "RECONCILED";
                      const staff = event.actorUserId ? order.staffProfiles[event.actorUserId] : null;
                      const staffName = event.actorName ?? staff?.name ?? null;
                      const staffImg = staff?.imageUrl ?? null;
                      const time = new Date(event.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

                      if (isComment) {
                        return (
                          <div key={event.id} className="ord-tl-event">
                            <div className="ord-tl-event__dot" />
                            <div className="ord-tl-comment-card">
                              <div className="ord-tl-comment-card__header">
                                <div className="ord-tl-comment-card__avatar">
                                  {staffImg ? (
                                    <img src={staffImg} alt="" className="ord-tl-comment-card__avatar-img" />
                                  ) : (
                                    <EditorIcon name="person" size={18} />
                                  )}
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
                        <div key={event.id} className={`ord-tl-event${isDiagnostic ? " ord-tl-event--diagnostic" : ""}`}>
                          <div className={`ord-tl-event__dot${isDiagnostic ? " ord-tl-event__dot--diagnostic" : ""}`} />
                          <div className="ord-tl-event__body">
                            {staffName && <span className="ord-tl-event__actor">{staffName} · </span>}
                            <span>{event.message}</span>
                            {isEmail && (
                              <button type="button" className="ord-tl-event__email-pill">Visa e-postmeddelande</button>
                            )}
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

          {/* ── Sidebar ─────────────────────────────────── */}
          <div className="pf-sidebar">

            {/* Anteckningar */}
            <div style={CARD}>
              <div className="ord-note-header">
                <span className="pf-card-title">Anteckningar</span>
                <button type="button" className="ord-note-edit" onClick={() => { setNoteValue(order.customerNote ?? ""); setNoteModalOpen(true); }}>
                  <EditorIcon name="edit" size={16} />
                </button>
              </div>
              <div className="ord-customer-note">
                {order.customerNote || <span className="ord-customer-note--empty">Inga anteckningar från kunden</span>}
              </div>
            </div>

            {/* Kund */}
            <div style={CARD}>
              <div className="ord-sidebar-label">Kund</div>
              <a className="ord-sidebar-link" href={order.guestAccountId ? `/guests/${order.guestAccountId}` : "#"}>
                {order.guestName || "—"}
              </a>
              <a className="ord-sidebar-link ord-sidebar-link--secondary" href={order.guestAccountId ? `/guests/${order.guestAccountId}` : "#"}>
                {order.guestOrderCount === 1 ? "1 order" : `${order.guestOrderCount} ordrar`}
              </a>

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>Kontaktuppgifter</div>
              <div className="ord-detail-field ord-detail-field--secondary">{order.guestEmail}</div>
              {order.guestPhone && (
                <div className="ord-detail-field ord-detail-field--secondary">{order.guestPhone}</div>
              )}

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>Faktureringsadress</div>
              {order.guestAddress && (order.guestAddress.address1 || order.guestAddress.city) ? (
                <div className="ord-address">
                  {order.guestName && <div>{order.guestName}</div>}
                  {order.guestAddress.company && <div>{order.guestAddress.company}</div>}
                  {order.guestAddress.address1 && <div>{order.guestAddress.address1}</div>}
                  {order.guestAddress.address2 && <div>{order.guestAddress.address2}</div>}
                  {(order.guestAddress.postalCode || order.guestAddress.city) && (
                    <div>{[order.guestAddress.postalCode, order.guestAddress.city].filter(Boolean).join(" ")}</div>
                  )}
                  {order.guestAddress.country && order.guestAddress.country !== "SE" && (
                    <div>{order.guestAddress.country}</div>
                  )}
                </div>
              ) : (
                <div className="ord-detail-field ord-detail-field--secondary" style={{ fontStyle: "italic", color: "var(--admin-text-tertiary)" }}>Ingen adress</div>
              )}
            </div>


            {/* Kanal */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Kanal</span>
              </div>
              <div className="ord-detail-field">
                {CHANNEL_LABELS[order.sourceChannel ?? "direct"] ?? order.sourceChannel ?? "Webbshop"}
              </div>
              {order.sourceExternalId && (
                <div className="ord-detail-field ord-detail-field--mono">
                  {order.sourceExternalId}
                </div>
              )}
            </div>

            {/* Taggar */}
            <div style={CARD}>
              <label className="mi-card__field-label" style={{ marginBottom: 6, display: "block" }}>Taggar</label>
              <div className="pf-collection-trigger">
                <input
                  type="text"
                  className="pf-collection-trigger__input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = tagInput.trim().toLowerCase();
                      if (!val) return;
                      const next = [...new Set([...order.tags, val])];
                      const res = await updateOrderTags(orderId, next);
                      if (res.ok) {
                        setTagInput("");
                        setOrder(await getOrder(orderId));
                      }
                    }
                  }}
                  placeholder=""
                />
              </div>
              {order.tags.length > 0 && (
                <div className="pf-collection-pills">
                  {order.tags.map((tag) => (
                    <span key={tag} className="pf-collection-pill">
                      {tag}
                      <button
                        type="button"
                        className="pf-collection-pill__remove"
                        onClick={async () => {
                          const next = order.tags.filter((t) => t !== tag);
                          const res = await updateOrderTags(orderId, next);
                          if (res.ok) setOrder(await getOrder(orderId));
                        }}
                        aria-label={`Ta bort ${tag}`}
                      >
                        <EditorIcon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Anteckningsmodal */}
        {noteModalOpen && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => !noteSaving && setNoteModalOpen(false)}
          >
            <div
              style={{ background: "#fff", borderRadius: 16, boxShadow: "0 24px 48px rgba(0,0,0,0.16)", width: 480, maxWidth: "90vw", overflow: "hidden" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--admin-border)", background: "#f3f3f4" }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "var(--admin-text)" }}>Redigera anteckningar</span>
                <button
                  type="button"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "none", borderRadius: 6, background: "none", color: "var(--admin-text-tertiary)", cursor: "pointer" }}
                  onClick={() => !noteSaving && setNoteModalOpen(false)}
                >
                  <EditorIcon name="close" size={18} />
                </button>
              </div>
              <div style={{ padding: 20 }}>
                <textarea
                  style={{ width: "100%", border: "1px solid var(--admin-border)", borderRadius: 8, padding: "10px 12px", fontSize: "var(--font-sm)", fontFamily: "inherit", fontWeight: 400, color: "var(--admin-text)", background: "#fff", resize: "vertical", lineHeight: 1.5, minHeight: 100, outline: "none" }}
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="Skriv en anteckning..."
                  rows={4}
                  maxLength={1000}
                  autoFocus
                />
                <div style={{ fontSize: 12, color: "#616161", marginTop: 0, lineHeight: 1.4 }}>
                  Använd Tidslinjen istället om du vill kommentera en order eller nämna en personalmedlem.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--admin-border)" }}>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  style={{ padding: "5px 10px", borderRadius: 8 }}
                  onClick={() => !noteSaving && setNoteModalOpen(false)}
                  disabled={noteSaving}
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  className={`admin-btn ${noteValue.trim() !== (order.customerNote ?? "") ? "admin-btn--accent" : ""}`}
                  style={{ padding: "5px 10px", borderRadius: 8 }}
                  disabled={noteValue.trim() === (order.customerNote ?? "") || noteSaving}
                  onClick={async () => {
                    setNoteSaving(true);
                    const res = await updateCustomerNote(orderId, noteValue);
                    if (res.ok) {
                      const updated = await getOrder(orderId);
                      setOrder(updated);
                      setNoteModalOpen(false);
                    }
                    setNoteSaving(false);
                  }}
                >
                  {noteSaving ? "Sparar..." : "Spara"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
