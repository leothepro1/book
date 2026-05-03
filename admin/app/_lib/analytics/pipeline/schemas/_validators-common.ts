/**
 * Shared validator helpers for the hand-rolled storefront-event
 * validators (Phase 3 PR-B Commit E).
 *
 * WHY HAND-ROLLED: bundling Zod 4 into the Web Worker overshoots the
 * 30 KB gzipped budget by 2× due to non-tree-shakeable locale and
 * JSON-Schema modules. The hand-rolled path lives next to each Zod
 * schema (`<event>.validator.ts` paired with `<event>.ts`) and
 * `validator-parity.test.ts` enforces lockstep.
 *
 * These helpers are intentionally trivial — type narrowing, no
 * external deps. Bundles as a few hundred bytes total.
 */

export interface Issue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: Issue[] };

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1;
}

export function isStringOfLength(v: unknown, n: number): v is string {
  return typeof v === "string" && v.length === n;
}

export function isStringMinLength(v: unknown, n: number): v is string {
  return typeof v === "string" && v.length >= n;
}

export function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

export function isIntNonNegative(v: unknown): v is number {
  return isInt(v) && v >= 0;
}

export function isIntPositive(v: unknown): v is number {
  return isInt(v) && v >= 1;
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(v: unknown): v is string {
  return typeof v === "string" && UUID_V4_RE.test(v);
}

export function isArrayOfNonEmptyStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string" && s.length >= 1);
}

export function isStringEnum<T extends string>(
  v: unknown,
  values: readonly T[],
): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

/**
 * Validate a `cart_total` object: `{ amount: int≥0, currency: 3-char string }`.
 * Used by cart_started, cart_updated, cart_abandoned, checkout_started.
 */
export function validateCartTotal(
  v: unknown,
  prefix: string,
  issues: Issue[],
): void {
  if (!isPlainObject(v)) {
    issues.push({ path: prefix, message: "must be an object" });
    return;
  }
  if (!isIntNonNegative(v.amount)) {
    issues.push({
      path: `${prefix}.amount`,
      message: "must be a non-negative integer",
    });
  }
  if (!isStringOfLength(v.currency, 3)) {
    issues.push({
      path: `${prefix}.currency`,
      message: "must be a 3-character string",
    });
  }
}

/**
 * Convenience: build a validator entry-point that produces a final
 * ValidationResult from an issues-collecting body.
 */
export function runValidation(
  build: (issues: Issue[]) => void,
): ValidationResult {
  const issues: Issue[] = [];
  build(issues);
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
