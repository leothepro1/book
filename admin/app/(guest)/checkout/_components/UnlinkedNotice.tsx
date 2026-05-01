"use client";

/**
 * Phase G — terminal-status notice for the buyer checkout page.
 *
 * Rendered when polling reports that the active `DraftCheckoutSession`
 * has transitioned to UNLINKED, EXPIRED, or CANCELLED. Wraps the
 * existing `CheckoutModal` so no new overlay CSS is introduced.
 *
 * Implements v1.3 §6.3 buyer-side notification. Copy is hardcoded
 * Swedish per CLAUDE.md UI convention; `data-i18n` attributes mirror
 * Phase F's status pages for future translation wiring.
 */

import { CheckoutModal } from "../CheckoutModal";

export type UnlinkedNoticeStatus = "UNLINKED" | "EXPIRED" | "CANCELLED";

interface UnlinkedNoticeProps {
  status: UnlinkedNoticeStatus;
}

const TITLES: Record<UnlinkedNoticeStatus, string> = {
  UNLINKED: "Beställningen har uppdaterats",
  EXPIRED: "Länken har gått ut",
  CANCELLED: "Bokningen har avbokats",
};

const BODIES: Record<UnlinkedNoticeStatus, string> = {
  UNLINKED:
    "Hotellet har gjort en ändring. Öppna länken i ditt mejl på nytt för att se den uppdaterade beställningen.",
  EXPIRED:
    "Den här betalningslänken är inte längre giltig. Kontakta hotellet för en ny länk om du vill slutföra bokningen.",
  CANCELLED:
    "Bokningen har avbokats av hotellet. Kontakta hotellet om du har frågor om återbetalning eller om du vill göra en ny bokning.",
};

export function UnlinkedNotice({ status }: UnlinkedNoticeProps) {
  return (
    <CheckoutModal
      open
      onClose={() => {
        // Non-dismissable: the page below shows the same blocked state
        // (form disabled). Closing the modal would reveal nothing
        // actionable — keep the buyer focused on the directive.
      }}
      title={TITLES[status]}
    >
      <p
        className="co__terms-content"
        data-i18n={`unlinked_notice.body.${status.toLowerCase()}`}
      >
        {BODIES[status]}
      </p>
    </CheckoutModal>
  );
}
