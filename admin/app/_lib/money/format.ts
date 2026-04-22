/**
 * Unified Swedish-locale money formatter.
 *
 * One entry point — `formatSek` — accepts both `bigint` (new B2B amounts) and
 * `number` (legacy Int-sized cents). BigInt-safe throughout: division into
 * major/minor units happens in BigInt, the final grouping uses Intl for the
 * safe range and a manual group-by-3 fallback for the unsafe upper tail.
 *
 * UX-debt #2 from FAS 4: the codebase previously had two helpers that did
 * almost the same job —
 *   - `formatPriceDisplay(number, currency)` (app/_lib/products/pricing.ts)
 *   - `formatSekFromCents(bigint|number|null, currency)`
 *     (app/(admin)/customers/companies/_components/formatters.ts)
 * Both are now thin re-exports that delegate to `formatSek`. Call sites
 * stay untouched; follow-ups can migrate incrementally.
 */

const GROUPED = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export interface FormatSekOptions {
  /** True (default) → "1 234,56 kr" / "1 234 kr" (no decimals for round amounts).
   *  False → always "1 234 kr" (drop minor units entirely). */
  showDecimals?: boolean;
  /** Override currency label. Defaults to SEK ("kr"). */
  currency?: string;
}

/**
 * Format a cents amount as Swedish currency. Accepts BigInt or number. Null /
 * undefined render as the em-dash placeholder used throughout the admin UI.
 */
export function formatSek(
  value: bigint | number | null | undefined,
  opts: FormatSekOptions = {},
): string {
  if (value === null || value === undefined) return "—";
  const { showDecimals = true, currency = "SEK" } = opts;
  const big = typeof value === "bigint" ? value : BigInt(value);

  const negative = big < BigInt(0);
  const abs = negative ? -big : big;
  const major = abs / BigInt(100);
  const minor = abs % BigInt(100);

  const majorFormatted = formatMajor(major);

  let body: string;
  if (!showDecimals || minor === BigInt(0)) {
    body = majorFormatted;
  } else {
    body = `${majorFormatted},${minor.toString().padStart(2, "0")}`;
  }

  const signed = negative ? `-${body}` : body;
  const suffix = currency === "SEK" ? "kr" : currency;
  return `${signed} ${suffix}`;
}

/** Swedish thin-space digit grouping. Uses Intl for safe-integer BigInts and a
 *  manual group-by-3 regex for amounts beyond Number.MAX_SAFE_INTEGER. */
function formatMajor(major: bigint): string {
  const asNumber = Number(major);
  if (BigInt(asNumber) === major && Number.isSafeInteger(asNumber)) {
    return GROUPED.format(asNumber);
  }
  const digits = major.toString();
  const negative = digits.startsWith("-");
  const bare = negative ? digits.slice(1) : digits;
  // Group digits in threes from the right with a thin no-break space ( ),
  // matching sv-SE Intl output.
  const grouped = bare.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return negative ? `-${grouped}` : grouped;
}
