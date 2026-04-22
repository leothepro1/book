/**
 * Swedish-locale formatters for the Companies admin UI.
 *
 * Money formatting moved to `app/_lib/money/format.ts` in FAS 5 (UX-debt #2).
 * `formatSekFromCents` is kept here as a deprecated re-export so FAS-4 call
 * sites keep compiling; new code should import `formatSek` directly.
 */

import { formatSek, type FormatSekOptions } from "@/app/_lib/money/format";

/**
 * @deprecated Use `formatSek` from `@/app/_lib/money/format`. Kept as a
 * backwards-compat shim; behaviour is identical.
 */
export function formatSekFromCents(
  cents: bigint | number | null | undefined,
  currency: string = "SEK",
): string {
  return formatSek(cents, { currency });
}

export { formatSek };
export type { FormatSekOptions };

const MONTH_SHORT = new Intl.DateTimeFormat("sv-SE", { month: "short" });
const TIME_HM = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateSv(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.getDate();
  const month = MONTH_SHORT.format(date).replace(".", "");
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatDateTimeSv(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.getDate();
  const month = MONTH_SHORT.format(date).replace(".", "");
  return `${day} ${month} kl. ${TIME_HM.format(date)}`;
}
