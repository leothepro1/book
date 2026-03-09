/**
 * Info Bar Section — "split-cards" variant
 *
 * The classic two-column layout:
 * - Left: Booking status card (check-in/out dates)
 * - Right: Weather widget (current temperature + icon)
 * - Both in surface-colored cards with subtle shadow
 *
 * Settings:
 *   showWeather       — Whether to show the weather card (default: true)
 *   showBookingStatus — Whether to show the booking status card (default: true)
 */

import BookingStatusCard from "../../../../_components/BookingStatusCard";
import WeatherWidget from "../../../../_components/WeatherWidget";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";

type InfoBarSettings = {
  showWeather?: boolean;
  showBookingStatus?: boolean;
};

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  padding: 16,
  background: "var(--surface)",
  color: "var(--text)",
  boxShadow: "0 0 0 1px #0000000a, 0 2px 4px #0000000f",
  fontSize: 15,
};

function InfoBarSplitCards({ settings, config, booking }: SectionProps<InfoBarSettings>) {
  const showWeather = settings.showWeather !== false;
  const showBookingStatus = settings.showBookingStatus !== false;

  if (!showWeather && !showBookingStatus) return null;

  const columns = showWeather && showBookingStatus ? "1fr 1fr" : "1fr";

  return (
    <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: columns, gap: 12 }}>
      {showBookingStatus && (
        <div style={CARD_STYLE}>
          <BookingStatusCard
            booking={booking}
            mutedOpacity={config.theme.typography.mutedOpacity}
            checkInTime={config.property.checkInTime}
            checkOutTime={config.property.checkOutTime}
          />
        </div>
      )}

      {showWeather && (
        <div style={CARD_STYLE}>
          <WeatherWidget
            latitude={config.property.latitude}
            longitude={config.property.longitude}
            mutedOpacity={config.theme.typography.mutedOpacity}
          />
        </div>
      )}
    </div>
  );
}

registerSection("info-bar", "split-cards", InfoBarSplitCards);

export default InfoBarSplitCards;
