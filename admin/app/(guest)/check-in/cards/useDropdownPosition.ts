import { useLayoutEffect, useState, type RefObject } from "react";

const DROPDOWN_MAX_HEIGHT = 320;
const GAP = 4;

type DropdownPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  direction: "down" | "up";
} | null;

/**
 * Compute dropdown position relative to an anchor element.
 * Automatically switches to drop-up if there's not enough space below.
 */
export function useDropdownPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  preferredMaxHeight = DROPDOWN_MAX_HEIGHT,
): DropdownPosition {
  const [pos, setPos] = useState<DropdownPosition>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }

    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;

    if (spaceBelow >= preferredMaxHeight || spaceBelow >= spaceAbove) {
      // Drop down
      setPos({
        top: rect.bottom + GAP,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(preferredMaxHeight, spaceBelow),
        direction: "down",
      });
    } else {
      // Drop up
      setPos({
        bottom: window.innerHeight - rect.top + GAP,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(preferredMaxHeight, spaceAbove),
        direction: "up",
      });
    }
  }, [open, anchorRef, preferredMaxHeight]);

  return pos;
}
