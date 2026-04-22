/**
 * SEO Engine — Explicit Bootstrap
 * ═══════════════════════════════
 *
 * Registers every known adapter with the registry. Idempotent:
 * calling `ensureSeoBootstrapped()` more than once has no additional
 * effect. Production code always calls it once, from the
 * `resolveSeoForRequest` call path — this guarantees registration
 * happens before any `resolve()` call, even if the adapter module
 * is tree-shaken elsewhere.
 *
 * We prefer explicit bootstrap over side-effect imports because:
 *   - Tests can exercise a clean registry (`_clearSeoAdaptersForTests`
 *     + `_resetSeoBootstrapForTests`) without working around
 *     module-level side effects.
 *   - The callsite is grep-able: searching for
 *     `ensureSeoBootstrapped` shows exactly who depends on the
 *     adapter set being populated.
 */

import { accommodationSeoAdapter } from "./adapters/accommodation";
import { registerSeoAdapter } from "./adapters/base";

let bootstrapped = false;

/**
 * Register every adapter with the registry. Safe to call multiple
 * times — the first call registers, subsequent calls are no-ops.
 *
 * MUST be called from the resolver's request-entry-point
 * (`resolveSeoForRequest`) so that adapter registration is
 * guaranteed before any `resolve()` call even if the adapter
 * module is not imported anywhere else.
 */
export function ensureSeoBootstrapped(): void {
  if (bootstrapped) return;
  registerSeoAdapter(accommodationSeoAdapter);
  bootstrapped = true;
}

/**
 * Test-only: reset the bootstrap flag so a subsequent
 * `ensureSeoBootstrapped()` call re-registers. Use alongside
 * `_clearSeoAdaptersForTests()` from `adapters/base` when tests
 * need a known-empty registry state.
 */
export function _resetSeoBootstrapForTests(): void {
  bootstrapped = false;
}
