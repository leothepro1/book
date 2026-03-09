"use client";

/**
 * Hero Slider — Section Config Card
 *
 * Custom config card for the "hero-slider" section type.
 * Uses GroupedFieldCard base. Extend with custom UI here
 * when slider-specific controls are needed (e.g. slide reordering).
 */

import { registerSectionConfig } from "../configRegistry";
import { GroupedFieldCard } from "./GroupedFieldCard";
import type { SectionConfigCardProps } from "../configRegistry";

function HeroSliderConfig(props: SectionConfigCardProps) {
  return <GroupedFieldCard {...props} />;
}

registerSectionConfig("hero-slider", HeroSliderConfig);

export default HeroSliderConfig;
