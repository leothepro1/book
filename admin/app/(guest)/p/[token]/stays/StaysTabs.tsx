"use client";

import { useState } from "react";
import type { NormalizedBooking } from "@/app/_lib/integrations/types";
import "./stays.css";

type Props = {
  currentBookings: NormalizedBooking[];
  previousBookings: NormalizedBooking[];
  lang: "sv" | "en";
  layout: "tabs" | "list";
  cardLayout?: "horizontal" | "vertical";
  cardShadow?: boolean;
  tabCurrentLabel?: string;
  tabPreviousLabel?: string;
  cardImageUrl?: string;
};

function formatDateLong(d: Date, lang: "sv" | "en") {
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=60";

export default function StaysTabs({
  currentBookings,
  previousBookings,
  lang,
  layout,
  cardLayout = "horizontal",
  cardShadow = true,
  tabCurrentLabel,
  tabPreviousLabel,
  cardImageUrl,
}: Props) {
  const [activeTab, setActiveTab] = useState<"current" | "previous">(
    currentBookings.length === 0 && previousBookings.length > 0 ? "previous" : "current",
  );

  const currentLabel = tabCurrentLabel || (lang === "en" ? "Current" : "Aktuella");
  const previousLabel = tabPreviousLabel || (lang === "en" ? "Previous" : "Tidigare");
  const heroImage = cardImageUrl || DEFAULT_IMAGE;

  function getBadgeText(booking: NormalizedBooking): string {
    if (booking.status === "active") {
      return lang === "en" ? "Checked in" : "Incheckad";
    }
    if (booking.status === "completed") {
      return lang === "en" ? "Completed" : "Avslutad";
    }
    return lang === "en" ? "Upcoming" : "Kommande";
  }


  function renderCard(b: NormalizedBooking) {
    const isVertical = cardLayout === "vertical";
    return (
      <div key={b.externalId} className={`booking-card${isVertical ? " booking-card--vertical" : ""}${cardShadow ? "" : " booking-card--no-shadow"}`}>
        <div
          className="booking-card__hero"
          style={{
            backgroundImage: isVertical
              ? `url("${heroImage}")`
              : `linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%), url("${heroImage}")`,
          }}
        >
          {!isVertical && (
            <div className="booking-card__badge">
              {getBadgeText(b)}
            </div>
          )}
        </div>

        <div className="booking-card__content">
          <div>
            <div className="booking-card__unit">{b.unit}</div>
            {isVertical && (
              <div className="booking-card__badge">
                {getBadgeText(b)}
              </div>
            )}
          </div>

          <div className="booking-card__dates">
            <div className="booking-card__date">
              <div className="booking-card__date-label">Incheckning</div>
              <div className="booking-card__date-value">
                {formatDateLong(new Date(b.arrival), lang)}
              </div>
            </div>

            <div className="booking-card__arrow">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 256 256"
                fill="currentColor"
              >
                <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"></path>
              </svg>
            </div>

            <div className="booking-card__date booking-card__date--right">
              <div className="booking-card__date-label">Utcheckning</div>
              <div className="booking-card__date-value">
                {formatDateLong(new Date(b.departure), lang)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List mode: all bookings flat, current first ──
  if (layout === "list") {
    const all = [...currentBookings, ...previousBookings];
    return (
      <div className="stays-list">
        {all.length === 0 ? (
          <div className="g-muted" style={{ textAlign: "center", padding: 40 }}>
            {lang === "en" ? "No bookings" : "Inga bokningar"}
          </div>
        ) : (
          all.map(renderCard)
        )}
      </div>
    );
  }

  // ── Tabs mode (default) ──
  const bookings = activeTab === "current" ? currentBookings : previousBookings;

  return (
    <>
      <div className="stays-tabs">
        <button
          type="button"
          className={`stays-tab ${activeTab === "current" ? "active" : ""}`}
          onClick={() => setActiveTab("current")}
        >
          {currentLabel}
        </button>
        <button
          type="button"
          className={`stays-tab ${activeTab === "previous" ? "active" : ""}`}
          onClick={() => setActiveTab("previous")}
        >
          {previousLabel}
        </button>
      </div>

      <div className="stays-list">
        {bookings.length === 0 ? (
          <div className="g-muted" style={{ textAlign: "center", padding: 40 }}>
            {activeTab === "current"
              ? lang === "en"
                ? "No current bookings"
                : "Inga aktuella bokningar"
              : lang === "en"
                ? "No previous bookings"
                : "Inga tidigare bokningar"}
          </div>
        ) : (
          bookings.map(renderCard)
        )}
      </div>
    </>
  );
}
