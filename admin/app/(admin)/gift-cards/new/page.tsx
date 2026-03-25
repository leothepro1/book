"use client";

import GiftCardConfigurePage from "../[id]/configure/page";

// /gift-cards/new simply renders the configure page without an ID.
// The configure page detects id="new" and works in create mode —
// nothing is saved to DB until the user explicitly saves.
export default function NewGiftCardPage() {
  return <GiftCardConfigurePage />;
}
