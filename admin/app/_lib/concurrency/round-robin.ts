/**
 * Round-robin interleaving by group key
 * ═════════════════════════════════════════
 *
 * Takes a flat list of items and a grouping function, returns a
 * reordered list where consecutive items rotate through distinct
 * groups. Used by the reliability-engine retry crons to prevent a
 * single tenant from monopolising worker slots.
 *
 * Example:
 *   Input:  [A1, A2, A3, A4, B1, C1, C2]   (grouped by letter)
 *   Output: [A1, B1, C1, A2, C2, A3, A4]
 *
 * Preserves within-group order (A1 before A2), which matters for
 * crons where each row has an ordered nextRetryAt: the oldest-due
 * row per tenant still gets processed first *within* that tenant's
 * slice of the batch.
 *
 * Complexity: O(n) time, O(g) extra space where g = distinct groups.
 *
 * Why not just ORDER BY tenantId? Because SQL ORDER BY doesn't
 * interleave — it clusters. "ORDER BY tenantId, nextRetryAt" gives
 * [A1, A2, A3, A4, B1, C1, C2], exactly the clustering we want to
 * AVOID. Round-robin has to happen in application code.
 */

/**
 * Reorder `items` so that consecutive items come from different
 * groups when possible. Optionally truncate to `maxLength`.
 *
 * Complexity / memory: O(n) + O(groups). Items from the same group
 * preserve their input order; groups are cycled in the order they
 * first appear.
 */
export function interleaveByGroup<T>(
  items: readonly T[],
  keyFn: (item: T) => string,
  maxLength?: number,
): T[] {
  if (items.length === 0) return [];

  // Build group lists in first-seen order so the cycle is
  // deterministic. A Map preserves insertion order.
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const out: T[] = [];
  const target =
    maxLength !== undefined ? Math.min(maxLength, items.length) : items.length;

  // Round-robin: loop through groups repeatedly, popping one item
  // from each per pass. Drained groups are skipped.
  const iters: Array<{ key: string; items: T[]; i: number }> = [];
  for (const [key, list] of groups) {
    iters.push({ key, items: list, i: 0 });
  }

  while (out.length < target) {
    let advanced = false;
    for (const iter of iters) {
      if (out.length >= target) break;
      if (iter.i < iter.items.length) {
        out.push(iter.items[iter.i++]);
        advanced = true;
      }
    }
    if (!advanced) break; // all iterators exhausted
  }

  return out;
}
