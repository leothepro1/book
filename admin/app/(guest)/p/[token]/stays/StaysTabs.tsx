"use client";

import { useState } from "react";
import type { Booking } from "@prisma/client";
import { BookingStatus } from "@prisma/client";
import "./stays.css";

type Props = {
  currentBookings: Booking[];
  previousBookings: Booking[];
  lang: "sv" | "en";
};

function formatDate(d: Date, lang: "sv" | "en") {
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateLong(d: Date, lang: "sv" | "en") {
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function StaysTabs({
  currentBookings,
  previousBookings,
  lang,
}: Props) {
  const [activeTab, setActiveTab] = useState<"current" | "previous">("current");

  const currentLabel = lang === "en" ? "Current" : "Aktuella";
  const previousLabel = lang === "en" ? "Previous" : "Tidigare";

  const bookings = activeTab === "current" ? currentBookings : previousBookings;

  function getBadgeText(booking: Booking): string {
    if (booking.status === BookingStatus.ACTIVE) {
      return lang === "en" ? "Checked in" : "Incheckad";
    }
    if (booking.status === BookingStatus.COMPLETED) {
      return lang === "en" ? "Completed" : "Avslutad";
    }
    return lang === "en" ? "Upcoming" : "Kommande";
  }

  function getBadgeClass(booking: Booking): string {
    if (booking.status === BookingStatus.ACTIVE) {
      return "booking-card__badge--ready";
    }
    if (booking.status === BookingStatus.COMPLETED) {
      return "booking-card__badge--completed";
    }
    return "booking-card__badge--pending";
  }

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
          bookings.map((b) => (
            <div key={b.id} className="booking-card">
              <div
                className="booking-card__hero"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%), url("https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=60")`,
                }}
              >
                <div className={`booking-card__badge ${getBadgeClass(b)}`}>
                  {getBadgeText(b)}
                </div>
              </div>

              <div className="booking-card__content">
                <div className="booking-card__unit">{b.unit}</div>

                <div className="booking-card__dates">
                  <div className="booking-card__date">
                    <div className="booking-card__date-label">Check-in</div>
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
                    <div className="booking-card__date-label">Check-out</div>
                    <div className="booking-card__date-value">
                      {formatDateLong(new Date(b.departure), lang)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
