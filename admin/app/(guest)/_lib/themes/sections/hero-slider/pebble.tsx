/**
 * Hero Slider Section — "pebble" variant
 *
 * Full-width carousel with centered active item.
 * - Each slide: background image + left-to-right gradient + text + CTA
 * - Active slide scale(1), adjacent slides scale(0.85) with ~10% visible
 * - aspect-ratio: 5 / 2
 * - Gradient color configurable via settings
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";
import { PebbleSliderClient } from "./PebbleSliderClient";

type HeroSliderSettings = {
  gradientColor?: string;
};

const PLACEHOLDER_SLIDES = [
  {
    id: "1",
    image: "https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=1200&q=60",
    title: "Upplev spa & wellness",
    cta: "Boka nu",
    href: "#",
  },
  {
    id: "2",
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=60",
    title: "Restaurang & bar",
    cta: "Se menyn",
    href: "#",
  },
  {
    id: "3",
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=60",
    title: "Aktiviteter & äventyr",
    cta: "Utforska",
    href: "#",
  },
];

function HeroSliderPebble({ settings }: SectionProps<HeroSliderSettings>) {
  const gradientColor = settings.gradientColor || "#000000";

  return (
    <div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1.2,
          fontFamily: "var(--font-heading)",
          color: "var(--text, #1a1a1a)",
          marginTop: 10,
          marginBottom: 24,
          padding: "0 4px",
          textAlign: "center",
        }}
      >
        Välkommen Emma
      </div>
      <PebbleSliderClient
        slides={PLACEHOLDER_SLIDES}
        gradientColor={gradientColor}
      />
    </div>
  );
}

registerSection("hero-slider", "pebble", HeroSliderPebble);

export default HeroSliderPebble;
