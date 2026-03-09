"use client";

/**
 * Category Tabs — Section Config Card
 *
 * Custom config card for the "category-tabs" section type.
 * Uses GroupedFieldCard base. Extend with custom UI here
 * when tab-specific controls are needed (e.g. tab reordering).
 */

import { registerSectionConfig } from "../configRegistry";
import { GroupedFieldCard } from "./GroupedFieldCard";
import type { SectionConfigCardProps } from "../configRegistry";

function CategoryTabsConfig(props: SectionConfigCardProps) {
  return <GroupedFieldCard {...props} />;
}

registerSectionConfig("category-tabs", CategoryTabsConfig);

export default CategoryTabsConfig;
