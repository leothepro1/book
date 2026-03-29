export const dynamic = "force-dynamic";

/**
 * POST /api/checkout/validate-discount
 *
 * Preview endpoint for discount code validation. Called when a guest
 * types a code in the checkout UI. Evaluates the discount but does
 * NOT record usage — the result is shown in UI only.
 *
 * Always returns HTTP 200 regardless of whether the code is valid.
 * This prevents timing attacks and information leakage about whether
 * a code exists. The `valid` boolean in the response body is the
 * only signal. Client code must check `response.valid`, not HTTP status.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { evaluateDiscountCode } from "@/app/_lib/discounts/engine";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { log } from "@/app/_lib/logger";

const validateDiscountSchema = z.object({
  code: z.string().min(1).max(64),
  orderAmount: z.number().int().nonnegative(),
  productIds: z.array(z.string()).default([]),
  itemCount: z.number().int().nonnegative().default(0),
  guestEmail: z.string().email().optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
});

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("discount-validate", 20, 60 * 60 * 1000))) {
    return NextResponse.json({ valid: false, error: "RATE_LIMITED" }, { status: 429 });
  }

  // ── Tenant resolution from host header ──────────────────────
  const resolvedTenant = await resolveTenantFromHost();
  if (!resolvedTenant) {
    return NextResponse.json({ valid: false, error: "TENANT_NOT_FOUND" });
  }
  const tenantId = resolvedTenant.id;

  // ── Parse request body ──────────────────────────────────────
  let body: z.infer<typeof validateDiscountSchema>;
  try {
    const raw = await req.json();
    body = validateDiscountSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { valid: false, error: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // ── Evaluate discount code ────────────────────────────────
  const result = await evaluateDiscountCode({
    tenantId,
    code: body.code,
    orderAmount: body.orderAmount,
    productIds: body.productIds,
    itemCount: body.itemCount,
    guestEmail: body.guestEmail,
    checkInDate: body.checkInDate ? new Date(body.checkInDate) : undefined,
    checkOutDate: body.checkOutDate ? new Date(body.checkOutDate) : undefined,
  });

  if (result.valid) {
    log("info", "discount.validate.valid", {
      tenantId,
      code: body.code,
      discountAmount: result.discountAmount,
    });

    return NextResponse.json({
      valid: true,
      discountAmount: result.discountAmount,
      title: result.title,
      description: result.description,
      valueType: result.discount.valueType,
      value: result.discount.value,
    });
  }

  // Invalid responses also return 200 — no information leakage via HTTP status
  return NextResponse.json({
    valid: false,
    error: result.error,
  });
}
