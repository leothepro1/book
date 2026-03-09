/**
 * Hero Section — "fullscreen" variant
 *
 * Immersive, edge-to-edge hero layout:
 * - Full viewport height (100dvh)
 * - No border radius, bleeds to screen edges
 * - Stronger gradient overlay for readability
 * - Welcome text + subtitle at bottom with more breathing room
 * - Negative margin to negate page padding
 *
 * Settings:
 *   heroImageUrl  — Background image URL
 */

import { BookingStatus } from "@prisma/client";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";

type HeroFullscreenSettings = {
  heroImageUrl?: string;
};

const DEFAULT_HERO_IMAGE =
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=60";

function resolveSubtitle(bookingStatus: BookingStatus): string {
  switch (bookingStatus) {
    case BookingStatus.PRE_CHECKIN:
      return "Vi ser fram emot din ankomst.";
    case BookingStatus.ACTIVE:
      return "Vi hoppas att du har en trevlig vistelse hos oss.";
    case BookingStatus.COMPLETED:
      return "Din vistelse är nu avslutad. Tack för ditt besök.";
    default:
      return "";
  }
}

function HeroFullscreen({ settings, config, booking, bookingStatus }: SectionProps<HeroFullscreenSettings>) {
  const heroImageUrl = settings.heroImageUrl || DEFAULT_HERO_IMAGE;

  const title = `Välkommen ${booking.firstName}`;
  const subtitle = resolveSubtitle(bookingStatus);

  return (
    <div
      style={{
        position: "relative",
        width: "calc(100% + 34px)",
        marginLeft: -17,
        marginTop: -17,
        height: "100dvh",
        overflow: "hidden",
        background: "var(--background)",
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.65) 100%), url("${heroImageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 48,
          right: 24,
          display: "grid",
          gap: 8,
          color: "white",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            lineHeight: "1.1em",
            fontFamily: "var(--font-heading)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.4,
            opacity: 0.88,
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

registerSection("hero", "fullscreen", HeroFullscreen);

export default HeroFullscreen;
