"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCustomer, updateCustomerInternalNote, addCustomerComment, type CustomerDetail } from "../actions";
import { addTagAction, removeTagAction } from "@/app/(admin)/guests/actions";
import { getOrganisationUsers, type OrgUser } from "@/app/(admin)/settings/users/actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useUser } from "@clerk/nextjs";
import { useDevClerkUser } from "@/app/(admin)/_components/DevClerkContext";
import { OrderBadge } from "@/app/(admin)/_components/orders/OrderBadge";
import type { OrderFulfillmentStatus } from "@prisma/client";
import "../../products/_components/product-form.css";
import "../../orders/orders.css";
import "../customers.css";

// ── Helpers ──────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "");
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${month}. kl. ${time}`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE");
}

const COUNTRY_NAMES: Record<string, string> = {
  SE: "Sverige", NO: "Norge", DK: "Danmark", FI: "Finland",
  DE: "Tyskland", NL: "Nederländerna", GB: "Storbritannien",
  US: "USA", FR: "Frankrike", ES: "Spanien", IT: "Italien",
};

function customerName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ") || "—";
}

const IS_DEV = process.env.NODE_ENV === "development";

// ClerkProvider does not wrap in dev (see app/layout.tsx). Bind at module
// load — each variant calls hooks unconditionally. The dev variant reads
// the real Clerk user fetched server-side at admin layout boot.
function useClerkAvatarUrlDev(): string | null {
  return useDevClerkUser()?.imageUrl || null;
}
function useClerkAvatarUrlProd(): string | null {
  return useUser().user?.imageUrl ?? null;
}
const useClerkAvatarUrl: () => string | null = IS_DEV ? useClerkAvatarUrlDev : useClerkAvatarUrlProd;

// ── Component ────────────────────────────────────────────────

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [comment, setComment] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<OrgUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionedStaff, setMentionedStaff] = useState<OrgUser[]>([]);
  const avatarUrl = useClerkAvatarUrl();
  const actionsRef = useRef<HTMLDivElement>(null);
  const mentionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCustomer(customerId).then(setCustomer).finally(() => setLoading(false));
  }, [customerId]);

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
    const res = await addCustomerComment(customerId, full);
    if (res.ok) {
      setComment("");
      setMentionedStaff([]);
      const el = document.querySelector<HTMLTextAreaElement>(".ord-tl-comment__input");
      if (el) el.style.height = "auto";
      setCustomer(await getCustomer(customerId));
    }
    setCommentPending(false);
  };

  if (loading) return null;

  if (!customer) {
    return (
      <div className="admin-page admin-page--no-preview products-page">
        <div className="admin-editor">
          <div className="admin-header pf-header">
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/customers")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>group</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>Kunden hittades inte</span>
            </h1>
          </div>
        </div>
      </div>
    );
  }

  const name = customerName(customer.firstName, customer.lastName);
  const createdDate = new Date(customer.createdAt);

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* Header */}
        <div className="admin-header pf-header">
          <div>
            <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button type="button" className="menus-breadcrumb__icon" onClick={() => router.push("/customers")}>
                <span className="material-symbols-rounded" style={{ fontSize: 22 }}>group</span>
              </button>
              <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
              <span style={{ marginLeft: 3 }}>{name}</span>
            </h1>
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
                  <button type="button" className="ord-header-actions__dropdown-item">
                    <EditorIcon name="mail" size={16} />
                    Skicka e-post
                  </button>
                  <button
                    type="button"
                    className="ord-header-actions__dropdown-item ord-header-actions__dropdown-item--danger"
                    onClick={() => setActionsOpen(false)}
                  >
                    <EditorIcon name="block" size={16} />
                    Inaktivera kund
                  </button>
                </div>
              )}
            </div>
            {/* Prev / Next */}
            <button
              type="button"
              className="ord-header-actions__nav"
              disabled={!customer.prevCustomerId}
              onClick={() => customer.prevCustomerId && router.push(`/customers/${customer.prevCustomerId}`)}
              aria-label="Föregående kund"
            >
              <EditorIcon name="expand_less" size={18} />
            </button>
            <button
              type="button"
              className="ord-header-actions__nav"
              disabled={!customer.nextCustomerId}
              onClick={() => customer.nextCustomerId && router.push(`/customers/${customer.nextCustomerId}`)}
              aria-label="Nästa kund"
            >
              <EditorIcon name="expand_more" size={18} />
            </button>
          </div>
        </div>

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

        {/* Kundöversikt */}
        <div className="cst-overview">
          <div className="cst-overview__inner">
            <div className="cst-overview__item">
              <span className="cst-overview__label">Spenderat belopp</span>
              <span className="cst-overview__value">
                {customer.stats.totalSpent > 0
                  ? `${formatPriceDisplay(customer.stats.totalSpent, customer.stats.currency)} kr`
                  : "0 kr"}
              </span>
            </div>
            <div className="cst-overview__item">
              <span className="cst-overview__label">Bokningar</span>
              <span className="cst-overview__value">{customer.stats.totalOrders}</span>
            </div>
            <div className="cst-overview__item">
              <span className="cst-overview__label">Kund sedan</span>
              <span className="cst-overview__value">
                {createdDate.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pf-body">
          {/* ── Main column ─────────────────────────────── */}
          <div className="pf-main">

            {/* Senaste bokning */}
            {customer.latestOrder ? (() => {
              const o = customer.latestOrder;
              const ful = o.fulfillmentStatus as OrderFulfillmentStatus;
              const meta = o.metadata;
              return (
                <div style={CARD} className="ord-products-container">
                  <div className="pf-card-header" style={{ marginBottom: 4 }}>
                    <span className="pf-card-title">Senaste bokning</span>
                    <button
                      type="button"
                      className="ord-note-edit"
                      onClick={() => router.push(`/orders/${o.id}`)}
                      aria-label="Visa order"
                    >
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-accent)" }}>#{o.orderNumber}</span>
                    </button>
                  </div>
                  <div className="ord-container-badge-row">
                    <OrderBadge type="fulfillment" fulfillment={ful} />
                    {o.fulfilledAt && <span className="ord-container-badge-date">Levererad {formatShortDate(o.fulfilledAt)}</span>}
                    {o.cancelledAt && !o.fulfilledAt && <span className="ord-container-badge-date">Avbokad {formatShortDate(o.cancelledAt)}</span>}
                  </div>
                  {o.lineItems.map((item, itemIndex) => {
                    const isAccommodation = itemIndex === 0;
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
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <button type="button" style={{ fontSize: 13, padding: "5px 12px", border: "1px solid var(--admin-border)", borderRadius: 8, background: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, color: "var(--admin-text)" }}>
                      Visa alla bokningar
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div style={CARD}>
                <div style={{ fontSize: 13, color: "var(--admin-text-secondary)" }}>Inga bokningar</div>
              </div>
            )}

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
                const groups: { date: string; label: string; events: typeof customer.events }[] = [];
                for (const event of customer.events) {
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
                      const isComment = event.type === "COMMENT_ADDED";
                      const isEmail = event.type === "GUEST_EMAIL_SENT";
                      const staff = event.actorUserId ? customer.staffProfiles[event.actorUserId] : null;
                      const staffName = (event.metadata?.authorName as string) ?? staff?.name ?? null;
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
                        <div key={event.id} className="ord-tl-event">
                          <div className="ord-tl-event__dot" />
                          <div className="ord-tl-event__body">
                            {staffName && <span className="ord-tl-event__actor">{staffName} · </span>}
                            <span>{event.message ?? event.type}</span>
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

            {/* Kund */}
            <div style={CARD}>
              <div className="ord-sidebar-label">Kund</div>
              <div className="ord-detail-field">{name}</div>
              {customer.state !== "ENABLED" && (
                <div style={{ display: "inline-block", background: "#FFD6A4", color: "#5E4200", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                  {customer.state === "DISABLED" ? "Inaktiverad" : customer.state === "INVITED" ? "Inbjuden" : customer.state}
                </div>
              )}

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>Kontaktuppgifter</div>
              <div className="ord-detail-field ord-detail-field--secondary">{customer.email}</div>
              {customer.phone && (
                <div className="ord-detail-field ord-detail-field--secondary">{customer.phone}</div>
              )}

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>Adress</div>
              {customer.address1 || customer.city ? (
                <div className="ord-address">
                  {name !== "—" && <div>{name}</div>}
                  {customer.address1 && <div>{customer.address1}</div>}
                  {customer.address2 && <div>{customer.address2}</div>}
                  {(customer.postalCode || customer.city) && (
                    <div>{[customer.postalCode, customer.city].filter(Boolean).join(" ")}</div>
                  )}
                  {customer.country && (
                    <div>{COUNTRY_NAMES[customer.country] ?? customer.country}</div>
                  )}
                </div>
              ) : (
                <div className="ord-detail-field ord-detail-field--secondary" style={{ fontStyle: "italic", color: "var(--admin-text-tertiary)" }}>Ingen adress</div>
              )}

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>E-postmarknadsföring</div>
              <div style={{ display: "inline-block", background: "#E8E8E8", color: "#616161", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 500 }}>
                {customer.emailMarketingState === "SUBSCRIBED" ? "Prenumererar" : customer.emailMarketingState === "UNSUBSCRIBED" ? "Avprenumererad" : customer.emailMarketingState === "PENDING" ? "Väntande" : "—"}
              </div>
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
                      if (customer.tags.includes(val)) { setTagInput(""); return; }
                      const res = await addTagAction(customerId, val);
                      if (res.success) {
                        setTagInput("");
                        setCustomer(await getCustomer(customerId));
                      }
                    }
                  }}
                  placeholder=""
                />
              </div>
              {customer.tags.length > 0 && (
                <div className="pf-collection-pills">
                  {customer.tags.map((tag) => (
                    <span key={tag} className="pf-collection-pill">
                      {tag}
                      <button
                        type="button"
                        className="pf-collection-pill__remove"
                        onClick={async () => {
                          await removeTagAction(customerId, tag);
                          setCustomer(await getCustomer(customerId));
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

            {/* Anteckningar */}
            <div style={CARD}>
              <div className="ord-note-header">
                <span className="pf-card-title">Anteckningar</span>
                <button type="button" className="ord-note-edit" onClick={() => { setNoteValue(customer.note ?? ""); setNoteModalOpen(true); }}>
                  <EditorIcon name="edit" size={16} />
                </button>
              </div>
              <div className="ord-customer-note">
                {customer.note || <span className="ord-customer-note--empty">Inga anteckningar</span>}
              </div>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--admin-border)", background: "#FAFAFA" }}>
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
                  maxLength={2000}
                  autoFocus
                />
                <div style={{ fontSize: 12, color: "#616161", marginTop: 0, lineHeight: 1.4 }}>
                  Interna anteckningar visas aldrig för kunden.
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
                  className={`admin-btn ${noteValue.trim() !== (customer.note ?? "") ? "admin-btn--accent" : ""}`}
                  style={{ padding: "5px 10px", borderRadius: 8 }}
                  disabled={noteValue.trim() === (customer.note ?? "") || noteSaving}
                  onClick={async () => {
                    setNoteSaving(true);
                    const res = await updateCustomerInternalNote(customerId, noteValue);
                    if (res.ok) {
                      const updated = await getCustomer(customerId);
                      setCustomer(updated);
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
