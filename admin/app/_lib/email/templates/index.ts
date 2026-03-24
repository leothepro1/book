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
import GuestOtp from "./guest-otp";
import OrderConfirmed from "./order-confirmed";
import type { EmailEventType } from "../registry";
import type { EmailBranding } from "../branding";

type TemplateVariables = Record<string, string>;

type TemplateRenderer = (
  vars: TemplateVariables,
  branding?: EmailBranding,
) => Promise<string>;

// Template components accept string variables + optional branding.
// React.createElement's strict typing conflicts with Record<string, string> & { branding?: object },
// so we cast each component. Props are fully type-safe in the template files themselves.
/* eslint-disable @typescript-eslint/no-explicit-any */
const TEMPLATE_MAP: Record<EmailEventType, TemplateRenderer> = {
  BOOKING_CONFIRMED: (v, b) => render(React.createElement(BookingConfirmed as any, { ...v, branding: b })),
  BOOKING_CANCELLED: (v, b) => render(React.createElement(BookingCancelled as any, { ...v, branding: b })),
  CHECK_IN_CONFIRMED: (v, b) => render(React.createElement(CheckInConfirmed as any, { ...v, branding: b })),
  CHECK_OUT_CONFIRMED: (v, b) => render(React.createElement(CheckOutConfirmed as any, { ...v, branding: b })),
  MAGIC_LINK: (v, b) => render(React.createElement(MagicLink as any, { ...v, branding: b })),
  SUPPORT_REPLY: (v, b) => render(React.createElement(SupportReply as any, { ...v, branding: b })),
  GUEST_OTP: (v, b) => render(React.createElement(GuestOtp as any, { ...v, branding: b })),
  ORDER_CONFIRMED: (v, b) => render(React.createElement(OrderConfirmed as any, { ...v, branding: b })),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function renderDefaultTemplate(
  eventType: EmailEventType,
  variables: TemplateVariables,
  branding?: EmailBranding,
): Promise<string> {
  const renderer = TEMPLATE_MAP[eventType];
  if (!renderer) {
    throw new Error(
      `[email] No default template for event type: ${eventType}`,
    );
  }
  return renderer(variables, branding);
}
