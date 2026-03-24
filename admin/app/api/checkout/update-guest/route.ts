export const dynamic = "force-dynamic";

/**
 * Update Guest Info on Pending Order
 * ═══════════════════════════════════
 *
 * Called by the checkout client after the PaymentIntent is created
 * but before payment confirmation. Updates guest info on the Order
 * so the webhook handler has email/name for confirmation.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { log } from "@/app/_lib/logger";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";

const inputSchema = z.object({
  orderId: z.string().min(1).max(50),
  guestName: z.string().min(1, "Namn krävs").max(200).trim(),
  guestEmail: z.string().email("Ogiltig e-postadress").max(254),
  guestPhone: z.string().max(50).optional(),
});

export async function POST(req: Request) {
  if (!(await checkRateLimit("ug", 5, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    select: { id: true, tenantId: true, status: true },
  });

  if (!order || order.tenantId !== tenant.id) {
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  if (order.status !== "PENDING") {
    return NextResponse.json(
      { error: "ORDER_NOT_PENDING", message: "Ordern kan inte längre uppdateras." },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        guestName: body.guestName,
        guestEmail: body.guestEmail,
        guestPhone: body.guestPhone ?? null,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "GUEST_INFO_UPDATED",
        message: `Gästuppgifter: ${body.guestName} (${body.guestEmail})`,
      },
    }),
  ]);

  log("info", "checkout.guest_info_updated", {
    tenantId: tenant.id, orderId: order.id, guestEmail: body.guestEmail,
  });

  return NextResponse.json({ ok: true });
}
