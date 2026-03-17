/**
 * Template Registry
 * ═════════════════
 *
 * Maps EmailEventType → react-email component render function.
 * This is the ONLY place that knows which component maps to which event type.
 *
 * Only renderDefaultTemplate() is exported — individual components
 * and TEMPLATE_MAP are internal implementation details.
 */

import { render } from "@react-email/components";
import * as React from "react";
import BookingConfirmed from "./booking-confirmed";
import BookingCancelled from "./booking-cancelled";
import CheckInConfirmed from "./check-in-confirmed";
import CheckOutConfirmed from "./check-out-confirmed";
import MagicLink from "./magic-link";
import SupportReply from "./support-reply";
import type { EmailEventType } from "../registry";

type TemplateVariables = Record<string, string>;

const TEMPLATE_MAP: Record<
  EmailEventType,
  (vars: TemplateVariables) => Promise<string>
> = {
  BOOKING_CONFIRMED: (vars) =>
    render(React.createElement(BookingConfirmed, vars)),
  BOOKING_CANCELLED: (vars) =>
    render(React.createElement(BookingCancelled, vars)),
  CHECK_IN_CONFIRMED: (vars) =>
    render(React.createElement(CheckInConfirmed, vars)),
  CHECK_OUT_CONFIRMED: (vars) =>
    render(React.createElement(CheckOutConfirmed, vars)),
  MAGIC_LINK: (vars) =>
    render(React.createElement(MagicLink, vars)),
  SUPPORT_REPLY: (vars) =>
    render(React.createElement(SupportReply, vars)),
};

export async function renderDefaultTemplate(
  eventType: EmailEventType,
  variables: TemplateVariables,
): Promise<string> {
  const renderer = TEMPLATE_MAP[eventType];
  if (!renderer) {
    throw new Error(
      `[email] No default template for event type: ${eventType}`,
    );
  }
  return renderer(variables);
}
