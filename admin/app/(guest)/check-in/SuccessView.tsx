"use client";

import { useRouter } from "next/navigation";
import type { CardDesignConfig, CardBackground } from "@/app/_lib/access-pass/card-design";
import "@/app/_lib/access-pass/wallet-success.css";

type Props = {
  nextHref: string;
  cardDesign: CardDesignConfig;
  tenantName: string;
  booking?: {
    arrivalISO: string;
    departureISO: string;
  };
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateRange(arrivalISO: string, departureISO: string): string {
  const a = new Date(arrivalISO);
  const d = new Date(departureISO);
  if (isNaN(a.getTime()) || isNaN(d.getTime())) return "";

  const aMonth = MONTH_SHORT[a.getMonth()];
  const aDay = a.getDate();
  const aYear = a.getFullYear();
  const dMonth = MONTH_SHORT[d.getMonth()];
  const dDay = d.getDate();
  const dYear = d.getFullYear();

  if (aYear !== dYear) return `${aMonth} ${aDay}, ${aYear} - ${dMonth} ${dDay}, ${dYear}`;
  if (aMonth === dMonth) return `${aMonth} ${aDay} - ${dDay}, ${aYear}`;
  return `${aMonth} ${aDay} - ${dMonth} ${dDay}, ${aYear}`;
}

function flattenCardStyle(design: CardDesignConfig): React.CSSProperties {
  const bg = design.background;
  const layers: string[] = [];

  // Logo rendered as <img> element, not background layer

  if (bg.mode === "IMAGE" && bg.overlayOpacity && bg.overlayOpacity > 0) {
    layers.push(`linear-gradient(rgba(0,0,0,${bg.overlayOpacity}), rgba(0,0,0,${bg.overlayOpacity}))`);
  }

  switch (bg.mode) {
    case "SOLID":
      layers.push(bg.color);
      break;
    case "GRADIENT":
      layers.push(`linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`);
      break;
    case "IMAGE":
      layers.push(`url(${bg.imageUrl}) center / cover no-repeat`);
      layers.push("#1a1a2e");
      break;
  }

  return {
    background: layers.join(", "),
    aspectRatio: "3.375 / 2.125",
    borderRadius: 12,
  };
}

export default function SuccessView({ nextHref, cardDesign, tenantName, booking }: Props) {
  const router = useRouter();

  const dateLabel = booking
    ? formatDateRange(booking.arrivalISO, booking.departureISO)
    : "";

  return (
    <div className="sektion73-success">
      <div className="sektion73-success__top">
        <div className="sektion73-success__title">Välkommen!</div>
        <div className="sektion73-success__body">
          Incheckningen är klar.{tenantName ? ` Varmt välkommen till ${tenantName}!` : " Varmt välkommen!"}
        </div>
      </div>

      {/* Wallet card with holder animation */}
      <div className="wallet-container">
        <div className="wallet-stage">
          <div className="wallet-holder-group">
            <div className="wallet-pass__shadow" />
            <div className="wallet-pass__holder">
              <span className="material-symbols-rounded wallet-pass__holder-icon">sensors</span>
            </div>
          </div>
          <div className="wallet-pass__shine" />
          <div className="wallet-pass">
            <div style={{ ...flattenCardStyle(cardDesign), display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 18px" }}>
              {cardDesign.logoUrl ? (
                <img src={cardDesign.logoUrl} alt="" style={{ maxWidth: 72, maxHeight: 42, objectFit: "contain" }} />
              ) : (
                <div />
              )}
              <span style={{ color: cardDesign.dateTextColor, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", lineHeight: 1 }}>
                {dateLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="sektion73-success__spacer" />

      <div className="sektion73-cta" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          onClick={() => router.push(nextHref)}
        >
          Ladda ner kort
        </button>
      </div>
    </div>
  );
}
