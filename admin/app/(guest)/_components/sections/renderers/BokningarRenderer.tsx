"use client";

/**
 * Bokningar Section Renderer
 *
 * Dedicated renderer for the locked "bokningar" section on the stays page.
 * Reads booking data from BookingsContext (NOT from props) — the theme
 * engine is never polluted with page-specific data.
 *
 * Settings consumed from SectionRendererProps:
 *   - heading, description (section settings)
 *   - layout, cardShadow, tabCurrentLabel, tabPreviousLabel, cardImageUrl (preset settings)
 *
 * COLOR SCHEME INTEGRATION:
 * Inherits scheme tokens via CSS cascading from the SectionItem wrapper.
 */

import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { useBookings } from "../BookingsContext";
import StaysTabs from "@/app/(guest)/p/[token]/stays/StaysTabs";

export function BokningarDefaultRenderer(props: SectionRendererProps) {
  const { settings, presetSettings } = props;
  const { currentBookings, previousBookings } = useBookings();

  const heading = (settings.heading as string) ?? "Bokningar";
  const description = (settings.description as string) ?? "";
  const cardLayout = (settings.cardLayout as "horizontal" | "vertical") ?? "horizontal";
  const layout = (presetSettings.layout as "tabs" | "list") ?? "tabs";
  const cardShadow = (presetSettings.cardShadow as boolean) ?? true;
  const tabCurrentLabel = (presetSettings.tabCurrentLabel as string) ?? "Aktuella";
  const tabPreviousLabel = (presetSettings.tabPreviousLabel as string) ?? "Tidigare";
  const cardImageUrl = (presetSettings.cardImageUrl as string) ?? "";

  const paddingTop = (settings.paddingTop as number) ?? 19;
  const paddingRight = (settings.paddingRight as number) ?? 17;
  const paddingBottom = (settings.paddingBottom as number) ?? 124;
  const paddingLeft = (settings.paddingLeft as number) ?? 17;

  const headingMarginBottom = (settings.headingMarginBottom as number) ?? 16;
  const headingSize = (settings.headingSize as string) ?? undefined;

  return (
    <div
      className="g-container"
      style={{
        padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
      }}
    >
      {heading && (
        <h1
          className="g-heading"
          style={{
            fontSize: headingSize,
            marginBottom: description ? 8 : headingMarginBottom,
          }}
          dangerouslySetInnerHTML={{ __html: heading }}
        />
      )}
      {description && (
        <p
          className="g-description"
          style={{ marginBottom: headingMarginBottom }}
          dangerouslySetInnerHTML={{ __html: description }}
        />
      )}

      <StaysTabs
        currentBookings={currentBookings}
        previousBookings={previousBookings}
        lang="sv"
        layout={layout}
        cardLayout={cardLayout}
        cardShadow={cardShadow}
        tabCurrentLabel={tabCurrentLabel}
        tabPreviousLabel={tabPreviousLabel}
        cardImageUrl={cardImageUrl}
      />
    </div>
  );
}
