/**
 * SEO redirect — public API barrel.
 * ═════════════════════════════════
 *
 * Every server action that writes or cleans up redirects should
 * import from here, not the individual files. Keeps the module's
 * surface small: path builders, write helpers, locale resolver.
 */

export { buildRedirectPath, normalizeRedirectPath } from "./paths";
export {
  collapseAndCreate,
  cleanupRedirectsForDeletedEntity,
} from "./writes";
export type {
  CollapseAndCreateArgs,
  CleanupForDeletedEntityArgs,
} from "./writes";
export { getTenantDefaultLocale } from "./locale";
