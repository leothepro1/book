"use server";

/**
 * previewSeoAction — client-facing server action for SearchListingEditor
 * ══════════════════════════════════════════════════════════════════════
 *
 * The admin's SearchListingEditor debounces user input and calls this
 * action on every settled keystroke. It's the thin boundary wrapper
 * around `previewSeoForEntity`:
 *
 *   1. `requireAdmin` — no anonymous previews.
 *   2. Resolve tenant via the standard admin `getCurrentTenant` path.
 *   3. `SeoMetadataSchema.safeParse` on client-supplied overrides —
 *      same schema that validates persisted entity.seo.
 *   4. Call the preview engine.
 *   5. On any engine throw, structured log + return a generic user-
 *      visible error. Never leak internals to the client.
 *
 * The locale argument is the tenant's default locale; per-request
 * locale derivation is M8 (hreflang pipeline). For now, previews
 * always render in `tenant.defaultLocale`.
 */

import { z } from "zod";

import { getCurrentTenant } from "../tenant/getCurrentTenant";
import { requireAdmin } from "../auth/devAuth";
import { log } from "../../../_lib/logger";
import {
  previewSeoForEntity,
  type SeoPreviewResult,
} from "../../../_lib/seo/preview";
import { tenantToSeoContext } from "../../../_lib/tenant/seo-context";
import { prisma } from "../../../_lib/db/prisma";
import {
  SeoMetadataSchema,
  SeoResourceTypes,
  type SeoResourceType,
} from "../../../_lib/seo/types";

export type PreviewSeoActionResult =
  | { readonly ok: true; readonly preview: SeoPreviewResult }
  | { readonly ok: false; readonly error: string };

export interface PreviewSeoActionArgs {
  readonly resourceType: SeoResourceType;
  /**
   * `null` = "/new flow" (no entity row yet). The engine swaps in
   * the resource-type-specific placeholder slug so the preview
   * URL reads coherently while the merchant is still typing.
   */
  readonly entityId: string | null;
  readonly overrides: unknown;
  /**
   * Live entity-form values for title/description. Drives the
   * resolver's `titleTemplate` composition without persisting —
   * mirrors what the merchant sees in their main title input.
   * Distinct from `overrides`, which represents explicit SEO
   * overrides that short-circuit composition.
   */
  readonly entityFields?: {
    readonly title?: string;
    readonly description?: string;
  };
}

// Boundary-level validation of the full args object. `overrides` is
// re-validated against `SeoMetadataSchema.partial()` below because
// z.unknown() lets anything through at this level — the UI contract
// matters for resourceType + entityId; the override payload
// shape is the SEO engine's contract.
const EntityFieldsSchema = z
  .object({
    title: z.string().max(255).optional(),
    description: z.string().max(5000).optional(),
  })
  .optional();

const PreviewSeoActionArgsSchema = z.object({
  resourceType: z.enum(SeoResourceTypes),
  entityId: z.string().nullable(),
  overrides: z.unknown(),
  entityFields: EntityFieldsSchema,
});

export async function previewSeoAction(
  args: PreviewSeoActionArgs,
): Promise<PreviewSeoActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) {
    return { ok: false, error: "Inte inloggad" };
  }

  const argsParsed = PreviewSeoActionArgsSchema.safeParse(args);
  if (!argsParsed.success) {
    return { ok: false, error: "Ogiltig begäran" };
  }

  const parsed = SeoMetadataSchema.partial().safeParse(
    argsParsed.data.overrides,
  );
  if (!parsed.success) {
    return { ok: false, error: "Ogiltig indata" };
  }

  // Resolve locale from tenant's primary locale row — the same path
  // the SEO engine uses for defaultLocale. Per-request admin-locale
  // derivation is M8 scope.
  const locales = await prisma.tenantLocale.findMany({
    where: { tenantId: tenantData.tenant.id },
  });
  const tenantCtx = tenantToSeoContext({
    tenant: tenantData.tenant,
    locales,
  });

  try {
    const preview = await previewSeoForEntity({
      tenantId: tenantData.tenant.id,
      resourceType: argsParsed.data.resourceType,
      entityId: argsParsed.data.entityId,
      overrides: parsed.data,
      entityFields: argsParsed.data.entityFields,
      locale: tenantCtx.defaultLocale,
    });
    return { ok: true, preview };
  } catch (error) {
    log("error", "seo.preview.failed", {
      tenantId: tenantData.tenant.id,
      resourceType: argsParsed.data.resourceType,
      entityId: argsParsed.data.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: "Kunde inte generera förhandsvisning",
    };
  }
}
