/**
 * Bounded Concurrency Pool
 * ═════════════════════════
 *
 * Runs an async task per item with a fixed maximum in-flight count.
 * Nothing fancy — no priority, no queues, no cancellation. Designed
 * for cron-style workloads where you have a batch of tasks and want
 * to process them faster than serial but not fast enough to DoS a
 * downstream dependency (PMS adapter, DB, rate limiter).
 *
 * Why not p-limit / p-map: adding a new npm dep for 20 lines of code
 * is not a good trade. This is self-contained, zero-dep, and the
 * exact semantics we want.
 *
 * Guarantees:
 *   • Exactly `concurrency` workers running at any time
 *   • Each item processed exactly once
 *   • Collects results in the same order as inputs (via index)
 *   • Isolates errors: one task's throw does NOT stop siblings;
 *     the error is captured in the result for the caller to inspect
 *   • Bounded wall time: abortController deadline stops launching
 *     new tasks (in-flight ones finish on their own)
 */

export interface PoolItemResult<T> {
  ok: boolean;
  /** Present when ok === true. */
  value?: T;
  /** Present when ok === false. */
  error?: Error;
  /** True when the deadline elapsed before this item was attempted. */
  skippedDueToBudget?: boolean;
}

export interface PoolOptions {
  /** Maximum in-flight tasks. Must be >= 1. */
  concurrency: number;
  /** Optional wall-clock deadline (epoch ms). After this, un-started
   * tasks return { skippedDueToBudget: true }. In-flight tasks finish. */
  deadline?: number;
}

/**
 * Run `worker(item, index)` for every item with bounded concurrency.
 * Always resolves (never rejects) — inspect result[i].ok for failures.
 */
export async function runWithPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: PoolOptions,
): Promise<PoolItemResult<R>[]> {
  const { concurrency, deadline } = options;
  if (concurrency < 1) {
    throw new Error(`pool: concurrency must be >= 1 (got ${concurrency})`);
  }

  const results: PoolItemResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      if (deadline !== undefined && Date.now() >= deadline) {
        results[index] = { ok: false, skippedDueToBudget: true };
        continue; // keep draining the index stream to fill skipped slots
      }
      try {
        const value = await worker(items[index], index);
        results[index] = { ok: true, value };
      } catch (err) {
        results[index] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  // Launch up to `concurrency` workers. Each pulls from nextIndex
  // until exhausted. Workers share the `results` array by index.
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);

  return results;
}
