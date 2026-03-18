import { useEffect, useState, type RefObject } from "react";

/**
 * Determines whether a dropdown should open upward or downward
 * based on available viewport space.
 *
 * Returns "down" (default) or "up" if the menu would overflow the viewport bottom.
 * Re-evaluates when `open` changes to true.
 */
export function useDropDirection(
  triggerRef: RefObject<HTMLElement | null>,
  open: boolean,
  menuHeight = 260,
): "up" | "down" {
  const [dir, setDir] = useState<"up" | "down">("down");

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setDir("down");
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDir(spaceBelow < menuHeight ? "up" : "down");
  }, [open, triggerRef, menuHeight]);

  return dir;
}
