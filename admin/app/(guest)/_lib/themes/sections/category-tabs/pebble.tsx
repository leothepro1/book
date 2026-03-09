/**
 * Category Tabs Section — "pebble" variant
 *
 * Horizontal tab slider with content grid below.
 * - Tabs: "På anläggningen", "Mat & dryck", "Aktiviteter", "I området", "Information"
 * - Each tab shows a grid of 1:1 image cards with a title below
 * - Active tab has distinct styling
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";
import { PebbleTabsClient } from "./PebbleTabsClient";

type CategoryTabsSettings = Record<string, unknown>;

const PLACEHOLDER_TABS = [
  {
    id: "facility",
    label: "På anläggningen",
    items: [
      { image: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773087213/jpeg-optimizer_cory-bjork-D1yT791Nf9A-unsplash_leebnx.jpg", title: "Pool" },
      { image: "https://res.cloudinary.com/dmgmoisae/image/upload/v1773087208/jpeg-optimizer_christin-hume-0MoF-Fe0w0A-unsplash_ptqlp2.jpg", title: "Spa" },
    ],
  },
  {
    id: "food",
    label: "Mat & dryck",
    items: [
      { image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=60", title: "Restaurang" },
      { image: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=600&q=60", title: "Bar & lounge" },
    ],
  },
  {
    id: "activities",
    label: "Aktiviteter",
    items: [
      { image: "https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=60", title: "Simning" },
      { image: "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=600&q=60", title: "Vandring" },
    ],
  },
  {
    id: "area",
    label: "I området",
    items: [
      { image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=600&q=60", title: "Natur" },
      { image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=60", title: "Strand" },
    ],
  },
  {
    id: "info",
    label: "Information",
    items: [
      { image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=600&q=60", title: "Wi-Fi & uppkoppling" },
      { image: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=600&q=60", title: "Parkering" },
    ],
  },
];

function CategoryTabsPebble({}: SectionProps<CategoryTabsSettings>) {
  return (
    <div style={{ marginTop: 70 }}>
      <div
        style={{
          fontSize: 23,
          fontWeight: 700,
          lineHeight: 1.2,
          fontFamily: "var(--font-heading)",
          color: "var(--text, #1a1a1a)",
          marginBottom: 17,
          textAlign: "left",
        }}
      >
        Under din vistelse
      </div>
      <PebbleTabsClient tabs={PLACEHOLDER_TABS} />
    </div>
  );
}

registerSection("category-tabs", "pebble", CategoryTabsPebble);

export default CategoryTabsPebble;
