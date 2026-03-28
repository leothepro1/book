/**
 * Emit GUEST_EMAIL_SENT event on the guest timeline.
 * Call after a successful sendEmailEvent() when the order has a linked guestAccountId.
 * Non-blocking — errors are caught and logged.
 */

import { createGuestAccountEvent } from "@/app/_lib/guests/events";
import { log } from "@/app/_lib/logger";

export async function emitGuestEmailEvent(opts: {
  tenantId: string;
  guestAccountId: string;
  emailType: string;
  recipientEmail: string;
  orderId?: string;
  orderNumber?: number;
}): Promise<void> {
  try {
    await createGuestAccountEvent({
      tenantId: opts.tenantId,
      guestAccountId: opts.guestAccountId,
      type: "GUEST_EMAIL_SENT",
      message: `${opts.emailType} skickat till ${opts.recipientEmail}`,
      metadata: {
        emailType: opts.emailType,
        recipientEmail: opts.recipientEmail,
        ...(opts.orderId ? { orderId: opts.orderId } : {}),
        ...(opts.orderNumber ? { orderNumber: opts.orderNumber } : {}),
      },
      orderId: opts.orderId,
    });
  } catch (err) {
    // Email was sent but timeline event failed — log as error, not warn
    log("error", "guest.email_event.failed", {
      tenantId: opts.tenantId,
      guestAccountId: opts.guestAccountId,
      error: String(err),
    });
  }
}
