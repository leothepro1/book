/**
 * Block Renderer — Renders a resolved block with all its slots.
 *
 * This is the generic fallback. Section-specific renderers (like Tabs)
 * typically render blocks in their own layout and don't use this directly.
 */

import type { ResolvedBlock } from "@/app/_lib/sections/types";
import { SlotRenderer } from "./SlotRenderer";

export function BlockRenderer({ block }: { block: ResolvedBlock }) {
  const slotKeys = Object.keys(block.slots);
  const pt = (block.settings.paddingTop as number) || 0;
  const pr = (block.settings.paddingRight as number) || 0;
  const pb = (block.settings.paddingBottom as number) || 0;
  const pl = (block.settings.paddingLeft as number) || 0;
  const hasPadding = pt || pr || pb || pl;

  return (
    <div
      data-block-id={block.block.id}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: hasPadding ? `${pt}px ${pr}px ${pb}px ${pl}px` : undefined,
      }}
    >
      {slotKeys.map((key) => (
        <SlotRenderer key={key} slot={block.slots[key]} />
      ))}
    </div>
  );
}
