import { formatSek } from "@/app/_lib/money/format";

/**
 * Render a money amount stored as cents (ören). BigInt-safe.
 *
 * Pass `tone="muted"` for placeholder "—" rendering styling, or "negative" for
 * subtle colour emphasis on refunds / deductions. Keep logic thin here — the
 * real work happens in formatSekFromCents.
 */
export function MoneyCell({
  cents,
  currency = "SEK",
  tone,
  className,
}: {
  cents: bigint | number | null | undefined;
  currency?: string;
  tone?: "default" | "muted" | "negative" | "positive";
  className?: string;
}) {
  const formatted = formatSek(cents, { currency });
  const toneClass =
    tone === "muted"
      ? "co-money co-money--muted"
      : tone === "negative"
        ? "co-money co-money--negative"
        : tone === "positive"
          ? "co-money co-money--positive"
          : "co-money";
  return <span className={`${toneClass}${className ? ` ${className}` : ""}`}>{formatted}</span>;
}
