/**
 * SEO redirect — write-path helpers
 * ═════════════════════════════════
 *
 * Invariants owned by this module (the middleware + admin UI rely on
 * them — breaking these silently breaks production SEO):
 *
 *   A. NO CHAINS. Every redirect is exactly one hop. Historic
 *      redirects whose toPath equals an entity's OLD path are
 *      re-pointed at the entity's NEW path atomically with the
 *      slug change.
 *
 *   B. NO SELF-REFERENCES. A redirect where fromPath === toPath
 *      would send the browser to itself, causing an infinite loop.
 *      Step (2) below guarantees the new current path is never a
 *      redirect source.
 *
 *   C. NO CYCLES. Invariants (A) + (B) structurally rule out A→B
 *      →A cycles without an explicit cycle-detection pass.
 *
 *   D. ATOMIC WITH ENTITY SLUG UPDATE. Callers MUST invoke
 *      `collapseAndCreate` inside the same `prisma.$transaction`
 *      that updates the entity's `slug` column. Partial
 *      application — slug changed but redirect not created, or vice
 *      versa — leaves the catalog in a broken state.
 */

import type { Prisma } from "@prisma/client";

import { normalizeRedirectPath } from "./paths";

// Default status code for auto-generated slug-change redirects.
// 301 Permanent is the Shopify convention — signals to search
// engines that the old URL is gone and link equity should transfer.
const DEFAULT_STATUS_CODE = 301;

export interface CollapseAndCreateArgs {
  readonly tenantId: string;
  readonly oldPath: string;
  readonly newPath: string;
  readonly locale: string;
}

/**
 * Atomically transition an entity's URL from oldPath to newPath.
 *
 * Three DB operations inside the provided transaction:
 *
 *   1. CHAIN COLLAPSE — update every redirect whose `toPath ===
 *      oldPath` to point at `newPath` instead. Historic redirects
 *      to the old slug now resolve in one hop to the new slug.
 *
 *   2. SLUG-REVERT GUARD — delete every redirect whose `fromPath
 *      === newPath`. Covers two cases:
 *        (a) The classic revert A → B → A. Step (1) turned the
 *            existing A→B row into A→A (self-reference). This step
 *            deletes it.
 *        (b) Stale rows left from a prior crashed transaction or
 *            manual DB edit where a redirect already sits on the
 *            path we're about to serve directly. We'd otherwise
 *            hit the unique-constraint on step (3).
 *
 *   3. INSERT OLD→NEW — upsert `oldPath → newPath`. Upsert (rather
 *      than create) handles a defensive edge: another transaction
 *      between step (2) and step (3) could have inserted a row,
 *      though in practice the outer transaction's isolation
 *      prevents this. Upsert lets the caller retry safely.
 *
 * No-op when `oldPath === newPath` (nothing changed; common when
 * the entity's title was edited but generated the same slug).
 *
 * All paths are normalized (lowercase, no trailing slash) before
 * use — same function as the middleware lookup, so the stored row
 * matches a future lookup byte-for-byte.
 */
export async function collapseAndCreate(
  tx: Prisma.TransactionClient,
  args: CollapseAndCreateArgs,
): Promise<void> {
  const oldPath = normalizeRedirectPath(args.oldPath);
  const newPath = normalizeRedirectPath(args.newPath);

  if (oldPath === newPath) return;

  // Step 1 — chain collapse.
  //
  // Any redirect "X → oldPath" in this tenant+locale becomes
  // "X → newPath". A side effect we handle in step 2: the existing
  // "oldPath → newPath"... wait, that redirect doesn't exist yet;
  // what CAN exist is "oldPath → someOlderPath" (still in the
  // table because the entity used to have yet another slug before
  // oldPath). That case is caught: `toPath === oldPath` → this
  // updateMany picks it up and repoints to newPath. Result:
  // "oldPath → newPath" directly.
  //
  // BUT: this step can also pick up a row whose fromPath is ALSO
  // newPath (e.g., a prior A→newPath redirect exists; if oldPath
  // happened to equal A, we'd rewrite it to newPath→newPath, a
  // self-reference). Step 2's delete covers that branch by
  // removing any row whose fromPath matches newPath.
  await tx.seoRedirect.updateMany({
    where: {
      tenantId: args.tenantId,
      toPath: oldPath,
      locale: args.locale,
    },
    data: { toPath: newPath },
  });

  // Step 2 — slug-revert + self-reference guard.
  //
  // The new current path must NEVER be a redirect source. After
  // step 1 it might be (the A → B → A scenario, or a stale row),
  // so wipe any row with fromPath === newPath. Also frees the
  // unique slot for step 3's upsert if the row came from a
  // self-reference that step 1 just produced.
  await tx.seoRedirect.deleteMany({
    where: {
      tenantId: args.tenantId,
      fromPath: newPath,
      locale: args.locale,
    },
  });

  // Step 3 — insert the new oldPath→newPath redirect.
  //
  // Upsert rather than create so the helper is idempotent under
  // transaction retry. `updatedAt` refreshes automatically via
  // Prisma's `@updatedAt` directive on the model.
  await tx.seoRedirect.upsert({
    where: {
      tenantId_fromPath_locale: {
        tenantId: args.tenantId,
        fromPath: oldPath,
        locale: args.locale,
      },
    },
    create: {
      tenantId: args.tenantId,
      fromPath: oldPath,
      toPath: newPath,
      locale: args.locale,
      statusCode: DEFAULT_STATUS_CODE,
    },
    update: {
      toPath: newPath,
      statusCode: DEFAULT_STATUS_CODE,
    },
  });
}

export interface CleanupForDeletedEntityArgs {
  readonly tenantId: string;
  readonly entityPath: string;
  readonly locale: string;
}

/**
 * Remove redirects pointing at an entity about to be deleted.
 * Called from the hard-delete server action inside its transaction.
 *
 * After this runs, the deleted entity's route serves 404 (normal
 * Next.js behaviour). Leaving redirects in place would 301 guests
 * and crawlers to that 404, which is worse than just 404-ing
 * directly.
 *
 * Archive paths (soft delete — Product.status = ARCHIVED + archivedAt)
 * do NOT call this: archiving is reversible, and the merchant may
 * un-archive later. Redirects stay intact across archive cycles.
 */
export async function cleanupRedirectsForDeletedEntity(
  tx: Prisma.TransactionClient,
  args: CleanupForDeletedEntityArgs,
): Promise<number> {
  const path = normalizeRedirectPath(args.entityPath);

  const result = await tx.seoRedirect.deleteMany({
    where: {
      tenantId: args.tenantId,
      toPath: path,
      locale: args.locale,
    },
  });

  // Returned so the caller can emit a structured
  // `seo.redirect.cleaned_up_on_delete` log with an accurate
  // `redirectsDeleted` count — useful for tracking whether a
  // deleted entity had inbound redirects worth cleaning up.
  return result.count;
}
