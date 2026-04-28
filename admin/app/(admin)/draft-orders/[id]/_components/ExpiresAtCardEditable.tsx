"use client";

import { ExpiresAtCard as NewExpiresAtCard } from "@/app/(admin)/draft-orders/new/_components/ExpiresAtCard";

interface ExpiresAtCardEditableProps {
  value: Date;
  onChange: (next: Date) => void;
}

/**
 * Edit-mode expires-at card for /konfigurera. Thin wrapper around /new
 * ExpiresAtCard. Date-input logic stays in /new; this wrapper exists for
 * naming symmetry with the other Editable cards.
 */
export function ExpiresAtCardEditable({
  value,
  onChange,
}: ExpiresAtCardEditableProps) {
  return <NewExpiresAtCard value={value} onChange={onChange} />;
}
