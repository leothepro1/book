/**
 * Slot Renderer — Renders all elements within a resolved slot.
 */

import type { ResolvedSlot } from "@/app/_lib/sections/types";
import { ElementRenderer } from "./elements";

export function SlotRenderer({ slot }: { slot: ResolvedSlot }) {
  if (slot.elements.length === 0) return null;

  return (
    <div data-slot={slot.definition.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {slot.elements.map((resolved) => (
        <ElementRenderer key={resolved.element.id} resolved={resolved} />
      ))}
    </div>
  );
}
