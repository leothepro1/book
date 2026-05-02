/**
 * Test helper: createMockAnalyticsTransaction()
 *
 * Returns a mock Prisma $transaction client with the surface that
 * emitAnalyticsEvent and friends require. Use this in any test that
 * exercises code paths emitting analytics events inside a transaction.
 *
 * If a future Phase adds new analytics models, extend this helper —
 * do not inline new mocks in test files.
 *
 * ──────────────────────────────────────────────────────────────────
 *
 * The emitter (`app/_lib/analytics/pipeline/emitter.ts`) gates its
 * input via `isTransactionClient(tx)` which checks:
 *
 *   - `tx` is an object
 *   - `typeof tx.$executeRaw === "function"`
 *   - `typeof tx.$transaction === "function"` is FALSE (a real tx
 *     client doesn't have $transaction; only the top-level prisma
 *     client does)
 *
 * Mocks that miss any of these throw `AnalyticsTransactionRequiredError`
 * before the emit body even runs.
 *
 * The helper exposes spies on every method so tests can assert call
 * counts and arguments without re-mocking.
 *
 * ──────────────────────────────────────────────────────────────────
 *
 * Two complementary patterns for tests that touch the analytics emit
 * path:
 *
 *   1. Mock `emitAnalyticsEvent` directly via `vi.mock(...)` if the
 *      test's contract is the surrounding business logic. This is
 *      the cheapest option — the test doesn't care about the emit.
 *
 *   2. Use `createMockAnalyticsTransaction()` if the test asserts
 *      the emit happened (call args, payload shape, etc.). The
 *      helper provides a tx that survives `isTransactionClient` and
 *      records every $executeRaw / $queryRaw call for later assertion.
 *
 * Most tests want option 1. Option 2 is the right tool when you need
 * to verify an event was emitted with the right shape.
 */

import { vi } from "vitest";

export interface MockAnalyticsTransaction {
  /** Spied raw SQL execute. Default mock returns 1 (rows affected). */
  $executeRaw: ReturnType<typeof vi.fn>;
  /** Spied raw SQL query. Default mock returns []. */
  $queryRaw: ReturnType<typeof vi.fn>;
  /**
   * Tagged-template variant of $executeRaw. Mirrors Prisma's
   * `tx.$executeRawUnsafe`. Most callers use the tagged-template
   * form, which Prisma routes through `$executeRaw`. Kept for
   * completeness so that any future direct call doesn't crash the
   * mock.
   */
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
  /** Tagged-template variant of $queryRaw — same rationale. */
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
  /**
   * Pipeline-model namespaces. The emitter writes to outbox via
   * raw SQL (`tx.$executeRaw`) for the reasons documented in
   * emitter.ts; these stubs are present so that any future consumer
   * that wants to use the model API instead of raw SQL doesn't
   * crash the mock.
   */
  analyticsPipelineOutbox: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  analyticsPipelineEvent: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  analyticsPipelineTenantConfig: {
    findUnique: ReturnType<typeof vi.fn>;
  };
}

/**
 * Construct a fresh mock tx for a single test. Each call returns a
 * brand-new object with fresh spies — DO NOT share across tests
 * unless that's specifically what you want to assert (cross-test
 * call accumulation usually indicates leaky state, not intent).
 *
 * Override default return values via `overrides`:
 *
 *   const tx = createMockAnalyticsTransaction({
 *     $queryRaw: vi.fn().mockResolvedValue([{ id: "outbox_1" }]),
 *   });
 */
export function createMockAnalyticsTransaction(
  overrides: Partial<MockAnalyticsTransaction> = {},
): MockAnalyticsTransaction {
  const tx: MockAnalyticsTransaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    analyticsPipelineOutbox: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    analyticsPipelineEvent: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    analyticsPipelineTenantConfig: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ tenantId: "tenant_1", pipelineEnabled: true }),
    },
    ...overrides,
  };
  return tx;
}

/**
 * Convenience wrapper: returns a `prisma`-shaped object whose
 * `$transaction` invokes the supplied callback with a fresh
 * `MockAnalyticsTransaction`. Mirrors `prisma.$transaction(fn)`
 * semantics for tests that want to test the full transactional
 * flow including the entry point.
 *
 * Tests that only need a tx (and call ingestion functions which
 * accept tx directly) can use `createMockAnalyticsTransaction`
 * standalone instead.
 */
export function createMockPrismaWithTransaction(
  txOverrides: Partial<MockAnalyticsTransaction> = {},
) {
  const $transaction = vi.fn(
    async <T>(fn: (tx: MockAnalyticsTransaction) => Promise<T>): Promise<T> => {
      const tx = createMockAnalyticsTransaction(txOverrides);
      return fn(tx);
    },
  );
  return { $transaction };
}
