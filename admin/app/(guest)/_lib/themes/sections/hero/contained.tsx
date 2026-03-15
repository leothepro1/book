/**
 * Hero Section — "contained" variant
 *
 * The original/classic hero layout:
 * - Contained within page padding with rounded corners
 * - Fixed 230px height
 * - Dark gradient overlay on background image
 * - Welcome title + status subtitle overlaid at bottom-left
 *
 * Settings:
 *   heroImageUrl  — Background image URL (falls back to default)
 */

import type { NormalizedBookingStatus } from "@/app/_lib/integrations/types";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";

type HeroContainedSettings = {
  heroImageUrl?: string;
};

const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=60";

function resolveSubtitle(bookingStatus: NormalizedBookingStatus, now: Date, departure: Date): string {
  const sameDay =
    now.getFullYear() === departure.getFullYear() &&
    now.getMonth() === departure.getMonth() &&
    now.getDate() === departure.getDate();

  if (sameDay) return "Utcheckning idag";

  switch (bookingStatus) {
    case "upcoming":
      return "Vi ser fram emot din ankomst.";
    case "active":
      return "Vi hoppas att du har en trevlig vistelse hos oss.";
    case "completed":
      return "Din vistelse är nu avslutad. Tack för ditt besök.";
    default:
      return "";
  }
}

function HeroContained({ settings, config, booking, bookingStatus }: SectionProps<HeroContainedSettings>) {
  const heroImageUrl = settings.heroImageUrl || DEFAULT_HERO_IMAGE;

  const title = `Välkommen ${booking.firstName}`;
  const now = new Date();
  const departure = new Date(booking.departure);
  const subtitle = resolveSubtitle(bookingStatus, now, departure);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 230,
        borderRadius: 12,
        overflow: "hidden",
        border: "none",
        background: "var(--background)",
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.75) 100%), url("${heroImageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 13,
          right: 15,
          display: "grid",
          gap: 5,
          color: "white",
        }}
      >
        <div
          style={{
            fontSize: 23,
            fontWeight: 700,
            lineHeight: "1.1em",
            opacity: 1,
            fontFamily: "var(--font-heading)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.35,
            opacity: 0.92,
            fontFamily: "var(--font-body)",
            fontWeight: 400,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

registerSection("hero", "contained", HeroContained);

export default HeroContained;
