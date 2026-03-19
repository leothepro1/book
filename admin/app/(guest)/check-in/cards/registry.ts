/**
 * Check-In Card Component Registry (client-only)
 *
 * Maps CheckinCardId → React component.
 * Separate from definition registry because components are
 * client-only and guest-only — no server/admin bundle pollution.
 */

import type { ComponentType } from "react";
import type { CheckinCardId, CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";

const cardComponents = new Map<CheckinCardId, ComponentType<CheckinCardComponentProps>>();

export function registerCardComponent(
  id: CheckinCardId,
  component: ComponentType<CheckinCardComponentProps>,
): void {
  cardComponents.set(id, component);
}

export function getCardComponent(
  id: CheckinCardId,
): ComponentType<CheckinCardComponentProps> | undefined {
  return cardComponents.get(id);
}
