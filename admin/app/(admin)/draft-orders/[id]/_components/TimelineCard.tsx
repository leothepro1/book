"use client";

import { type CSSProperties } from "react";
import type { DraftOrderEvent } from "@prisma/client";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";
import { DRAFT_LABELS } from "@/app/_lib/draft-orders/badge";
import { formatSek } from "@/app/_lib/money/format";

export type TimelineEvent = Pick<
  DraftOrderEvent,
  "id" | "type" | "metadata" | "actorUserId" | "actorSource" | "createdAt"
>;

interface TimelineCardProps {
  events: TimelineEvent[];
}

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
  margin: 0,
};

const LIST: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

const ICON_WRAPPER: CSSProperties = {
  flexShrink: 0,
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "var(--admin-surface-muted, #f3f3f4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--admin-text-muted)",
};

const CONTENT: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const TITLE_LINE: CSSProperties = {
  fontWeight: 500,
  fontSize: 13,
  color: "var(--admin-text)",
};

const SUBTITLE: CSSProperties = {
  color: "var(--admin-text-muted)",
  fontSize: 12,
  marginTop: 2,
};

const META_LINE: CSSProperties = {
  color: "var(--admin-text-muted)",
  fontSize: 11,
  marginTop: 4,
};

function getEventTitle(type: string): string {
  switch (type) {
    case "CREATED":
      return "Utkast skapat";
    case "STATE_CHANGED":
      return "Status ändrad";
    case "LINE_ADDED":
      return "Rad tillagd";
    case "LINE_UPDATED":
      return "Rad ändrad";
    case "LINE_REMOVED":
      return "Rad borttagen";
    case "META_UPDATED":
      return "Detaljer uppdaterade";
    case "CUSTOMER_UPDATED":
      return "Kund ändrad";
    case "DISCOUNT_APPLIED":
      return "Rabatt tillämpad";
    case "DISCOUNT_REMOVED":
      return "Rabatt borttagen";
    case "PRICES_FROZEN":
      return "Priser låsta";
    case "INVOICE_SENT":
      return "Faktura skickad";
    case "INVOICE_RESENT":
      return "Faktura skickad om";
    case "INVOICE_OVERDUE":
      return "Faktura förfallen";
    case "CONVERTED":
      return "Konverterad till order";
    case "CANCELLED":
      return "Avbruten";
    case "HOLD_PLACED":
      return "Reservation gjord";
    case "HOLD_RELEASED":
      return "Reservation släppt";
    case "HOLD_FAILED":
      return "Reservation misslyckades";
    case "EXPIRED_CLEANUP":
      return "Utkast utgick";
    case "APPROVAL_REQUESTED":
      return "Godkännande begärt";
    case "APPROVAL_GRANTED":
      return "Godkänt";
    case "APPROVAL_REJECTED":
      return "Avslagit";
    default:
      return "Aktivitet";
  }
}

function getEventIcon(type: string): string {
  switch (type) {
    case "CREATED":
      return "receipt_long";
    case "STATE_CHANGED":
      return "sync_alt";
    case "LINE_ADDED":
      return "add_circle";
    case "LINE_UPDATED":
      return "edit";
    case "LINE_REMOVED":
      return "remove_circle";
    case "META_UPDATED":
      return "edit_note";
    case "CUSTOMER_UPDATED":
      return "person";
    case "DISCOUNT_APPLIED":
    case "DISCOUNT_REMOVED":
      return "local_offer";
    case "PRICES_FROZEN":
      return "lock";
    case "INVOICE_SENT":
      return "mail";
    case "INVOICE_RESENT":
      return "forward_to_inbox";
    case "INVOICE_OVERDUE":
      return "schedule";
    case "CONVERTED":
      return "check_circle";
    case "CANCELLED":
      return "cancel";
    case "HOLD_PLACED":
    case "HOLD_RELEASED":
      return "event";
    case "HOLD_FAILED":
      return "event_busy";
    case "EXPIRED_CLEANUP":
      return "hourglass_empty";
    case "APPROVAL_REQUESTED":
      return "pending";
    case "APPROVAL_GRANTED":
      return "verified";
    case "APPROVAL_REJECTED":
      return "block";
    default:
      return "circle";
  }
}

function getActorLabel(event: TimelineEvent): string {
  if (event.actorSource === "admin_ui") return "Administratör";
  if (event.actorSource === "cron") return "System";
  if (event.actorSource === "webhook") return "System (webhook)";
  if (event.actorSource === "api") return "System (API)";
  if (event.actorUserId !== null) return "Administratör";
  return "System";
}

function formatAbsoluteDate(date: Date): string {
  return format(date, "d MMM yyyy", { locale: sv });
}

function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const days = differenceInDays(now, date);
  if (days > 7) {
    return formatAbsoluteDate(date);
  }
  return formatDistanceToNow(date, { addSuffix: true, locale: sv });
}

/**
 * Defensive metadata extraction. Returns `null` when metadata is malformed
 * for the given event-type — render falls back to title-only. Never throws.
 */
function getEventSubtitle(event: TimelineEvent): string | null {
  const m = event.metadata;
  if (typeof m !== "object" || m === null || Array.isArray(m)) return null;
  const meta = m as Record<string, unknown>;

  switch (event.type) {
    case "STATE_CHANGED": {
      const from = typeof meta.from === "string" ? meta.from : null;
      const to = typeof meta.to === "string" ? meta.to : null;
      if (!from || !to) return null;
      const fromLabel =
        DRAFT_LABELS[from as keyof typeof DRAFT_LABELS] ?? from;
      const toLabel = DRAFT_LABELS[to as keyof typeof DRAFT_LABELS] ?? to;
      const reason = typeof meta.reason === "string" ? meta.reason : null;
      const base = `${fromLabel} → ${toLabel}`;
      return reason ? `${base} · Anledning: ${reason}` : base;
    }

    case "LINE_ADDED": {
      const title = typeof meta.title === "string" ? meta.title : null;
      if (!title) return null;
      const quantity =
        typeof meta.quantity === "number" ? meta.quantity : null;
      const unitPriceCents = readBigIntLike(meta.unitPriceCents);
      if (quantity !== null && unitPriceCents !== null) {
        return `${title} (${quantity}×, ${formatSek(unitPriceCents)})`;
      }
      return title;
    }

    case "LINE_UPDATED": {
      const title = typeof meta.title === "string" ? meta.title : null;
      if (!title) return null;
      const diff =
        typeof meta.diff === "object" && meta.diff !== null && !Array.isArray(meta.diff)
          ? (meta.diff as Record<string, unknown>)
          : null;
      if (diff && typeof diff.quantity === "object" && diff.quantity !== null) {
        const q = diff.quantity as Record<string, unknown>;
        if (typeof q.from === "number" && typeof q.to === "number") {
          return `${title} · Antal: ${q.from} → ${q.to}`;
        }
      }
      return title;
    }

    case "LINE_REMOVED": {
      return typeof meta.title === "string" ? meta.title : null;
    }

    case "META_UPDATED": {
      const diff =
        typeof meta.diff === "object" && meta.diff !== null && !Array.isArray(meta.diff)
          ? (meta.diff as Record<string, unknown>)
          : null;
      if (!diff) return null;
      const fieldLabels: Record<string, string> = {
        internalNote: "Intern anteckning",
        customerNote: "Kund-anteckning",
        tags: "Taggar",
        expiresAt: "Utgångsdatum",
      };
      const changedFields = Object.keys(diff)
        .map((key) => fieldLabels[key])
        .filter((label): label is string => Boolean(label));
      return changedFields.length > 0 ? changedFields.join(", ") : null;
    }

    case "CUSTOMER_UPDATED": {
      const diff =
        typeof meta.diff === "object" && meta.diff !== null && !Array.isArray(meta.diff)
          ? (meta.diff as Record<string, unknown>)
          : null;
      if (!diff) return null;
      const guestDiff = diff.guestAccountId;
      if (
        typeof guestDiff !== "object" ||
        guestDiff === null ||
        Array.isArray(guestDiff)
      )
        return null;
      const g = guestDiff as Record<string, unknown>;
      const hadCustomer = g.from !== null && g.from !== undefined;
      const hasCustomer = g.to !== null && g.to !== undefined;
      if (!hadCustomer && hasCustomer) return "Kund tillagd";
      if (hadCustomer && !hasCustomer) return "Kund borttagen";
      return "Kund ändrad";
    }

    case "DISCOUNT_APPLIED": {
      const code = typeof meta.code === "string" ? meta.code : null;
      if (!code) return null;
      const amountCents = readBigIntLike(meta.discountAmountCents);
      return amountCents !== null
        ? `${code} (-${formatSek(amountCents)})`
        : code;
    }

    case "DISCOUNT_REMOVED": {
      return typeof meta.previousCode === "string" ? meta.previousCode : null;
    }

    case "INVOICE_SENT": {
      const expires =
        typeof meta.shareLinkExpiresAt === "string"
          ? meta.shareLinkExpiresAt
          : null;
      if (!expires) return null;
      const d = new Date(expires);
      if (Number.isNaN(d.getTime())) return null;
      return `Förfaller ${formatAbsoluteDate(d)}`;
    }

    case "INVOICE_RESENT": {
      const expires =
        typeof meta.shareLinkExpiresAt === "string"
          ? meta.shareLinkExpiresAt
          : null;
      const rotated =
        typeof meta.rotatedPaymentIntent === "boolean"
          ? meta.rotatedPaymentIntent
          : null;
      const parts: string[] = [];
      if (expires) {
        const d = new Date(expires);
        if (!Number.isNaN(d.getTime())) {
          parts.push(`Ny förfaller ${formatAbsoluteDate(d)}`);
        }
      }
      if (rotated === true) parts.push("Ny betalningslänk");
      return parts.length > 0 ? parts.join(" · ") : null;
    }

    case "INVOICE_OVERDUE": {
      const graceDays =
        typeof meta.graceDays === "number" && Number.isFinite(meta.graceDays)
          ? meta.graceDays
          : null;
      return graceDays !== null
        ? `Markerad förfallen efter ${graceDays} dagar`
        : null;
    }

    case "CANCELLED": {
      const reason = typeof meta.reason === "string" ? meta.reason : null;
      return reason ? `Anledning: ${reason}` : null;
    }

    case "HOLD_RELEASED": {
      const source = typeof meta.source === "string" ? meta.source : null;
      return source ? `Källa: ${source}` : null;
    }

    case "HOLD_FAILED": {
      return typeof meta.error === "string" ? meta.error : null;
    }

    case "APPROVAL_REQUESTED": {
      const note =
        typeof meta.requestNote === "string" ? meta.requestNote : null;
      return note;
    }

    case "APPROVAL_GRANTED": {
      const note =
        typeof meta.approvalNote === "string" ? meta.approvalNote : null;
      return note;
    }

    case "APPROVAL_REJECTED": {
      const reason =
        typeof meta.rejectionReason === "string" ? meta.rejectionReason : null;
      return reason ? `Anledning: ${reason}` : null;
    }

    default:
      return null;
  }
}

/**
 * Some metadata fields ride the wire as bigint, others as number (when the
 * sender used .toString() and the receiver parsed back to number, or when
 * the original cast failed). Accept both.
 */
function readBigIntLike(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value))
    return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

interface TimelineRowProps {
  event: TimelineEvent;
  now?: Date;
}

function TimelineRow({ event, now }: TimelineRowProps) {
  const title = getEventTitle(event.type);
  const icon = getEventIcon(event.type);
  const actor = getActorLabel(event);
  const subtitle = getEventSubtitle(event);
  const time = formatRelativeTime(event.createdAt, now);

  return (
    <li style={ROW}>
      <div style={ICON_WRAPPER}>
        <span
          className="material-symbols-rounded"
          aria-hidden="true"
          style={{ fontSize: 18 }}
        >
          {icon}
        </span>
      </div>
      <div style={CONTENT}>
        <div style={TITLE_LINE}>{title}</div>
        {subtitle !== null && <div style={SUBTITLE}>{subtitle}</div>}
        <div style={META_LINE}>
          {actor} · {time}
        </div>
      </div>
    </li>
  );
}

export function TimelineCard({ events }: TimelineCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Aktivitet</span>
      </div>

      {events.length === 0 ? (
        <p style={EMPTY}>Ingen aktivitet.</p>
      ) : (
        <ul style={LIST}>
          {events.map((event) => (
            <TimelineRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </div>
  );
}
