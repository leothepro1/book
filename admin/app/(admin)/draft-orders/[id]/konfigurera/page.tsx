import { notFound } from "next/navigation";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { getDraft } from "@/app/_lib/draft-orders/get";
import { KonfigureraClient } from "../_components/KonfigureraClient";
import "../../../products/_components/product-form.css";

async function resolveTenantId(): Promise<string | null> {
  const { orgId } = await getAuth();
  if (!orgId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

function extractTermsName(frozen: unknown): string | null {
  if (frozen === null || typeof frozen !== "object" || Array.isArray(frozen)) {
    return null;
  }
  const name = (frozen as Record<string, unknown>).name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

export default async function KonfigureraDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantId = await resolveTenantId();
  if (!tenantId) notFound();

  const detail = await getDraft(id, tenantId);
  if (!detail) notFound();

  const draft = detail.draft;
  const paymentTerms =
    draft.paymentTermsId !== null
      ? {
          id: draft.paymentTermsId,
          name: extractTermsName(draft.paymentTermsFrozen),
          depositPercent:
            draft.depositPercent !== null
              ? Number(draft.depositPercent)
              : null,
          frozen: draft.paymentTermsFrozen !== null,
        }
      : null;

  return (
    <KonfigureraClient
      draft={{
        id: draft.id,
        displayNumber: draft.displayNumber,
        status: draft.status,
        createdAt: draft.createdAt,
        expiresAt: draft.expiresAt,
        invoiceSentAt: draft.invoiceSentAt,
        pricesFrozenAt: draft.pricesFrozenAt,
        cancelledAt: draft.cancelledAt,
        completedAt: draft.completedAt,
        cancellationReason: draft.cancellationReason,
        invoiceUrl: draft.invoiceUrl,
        shareLinkExpiresAt: draft.shareLinkExpiresAt,
        guestAccountId: draft.guestAccountId,
        companyLocationId: draft.companyLocationId,
        contactFirstName: draft.contactFirstName,
        contactLastName: draft.contactLastName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        appliedDiscountCode: draft.appliedDiscountCode,
        appliedDiscountAmount: draft.appliedDiscountAmount,
        appliedDiscountType: draft.appliedDiscountType,
        internalNote: draft.internalNote,
        customerNote: draft.customerNote,
        tags: draft.tags,
        subtotalCents: draft.subtotalCents,
        orderDiscountCents: draft.orderDiscountCents,
        shippingCents: draft.shippingCents,
        totalTaxCents: draft.totalTaxCents,
        totalCents: draft.totalCents,
        currency: draft.currency,
        lineItems: draft.lineItems.map((li) => ({
          ...li,
          lineDiscountValue:
            li.lineDiscountValue !== null
              ? Number(li.lineDiscountValue)
              : null,
        })),
      }}
      reservations={detail.reservations}
      customer={detail.customer}
      stripePaymentIntent={detail.stripePaymentIntent}
      prev={detail.prev}
      next={detail.next}
      paymentTerms={paymentTerms}
      events={detail.events.map((e) => ({
        id: e.id,
        type: e.type,
        metadata: e.metadata,
        actorUserId: e.actorUserId,
        actorSource: e.actorSource,
        createdAt: e.createdAt,
      }))}
    />
  );
}
