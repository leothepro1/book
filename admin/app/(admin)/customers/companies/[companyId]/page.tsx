import { notFound, redirect } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import {
  getCompany,
  listAvailableTerms,
  listCompanyEvents,
  listContactsForCompany,
  listLocations,
} from "@/app/_lib/companies";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { CompanyHeaderActions } from "../_components/CompanyHeaderActions";
import { BillingAddressEditCard } from "../_components/BillingAddressEditCard";
import { BillingSettingsCard } from "../_components/BillingSettingsCard";
import { CompanyLatestOrderCard } from "../_components/CompanyLatestOrderCard";
import { CompanyMetaCard } from "../_components/CompanyMetaCard";
import { CompanyNoteCard } from "../_components/CompanyNoteCard";
import { CompanyTagsCard } from "../_components/CompanyTagsCard";
import { CompanyTimeline } from "../_components/CompanyTimeline";
import "@/app/(admin)/products/_components/product-form.css";
import "@/app/(admin)/orders/orders.css";
import "../../customers.css";
import "../_components/companies.css";

/**
 * /admin/customers/companies/[companyId] — företagets konfigurera-vy.
 *
 * Ingen tab-bar längre — sidan visar en sammanhållen vertikal layout:
 *   1. pf-header (icon + chevron + namn + header-actions)
 *   2. .cst-overview-baren (Spenderat belopp · Bokningar · Kund sedan)
 *   3. pf-body → pf-main:
 *        a. Faktureringsadress-kort (förifyllda inputs, samma CSS som /new)
 *        b. CompanyTimeline (identisk struktur med ordrar/kund-tidslinjen)
 */

function addressFieldFromJson(v: unknown, key: string): string {
  if (!v || typeof v !== "object") return "";
  const val = (v as Record<string, unknown>)[key];
  return typeof val === "string" ? val : "";
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const session = await getCurrentTenant();
  if (!session) redirect("/sign-in");
  const tenantId = session.tenant.id;

  const { companyId } = await params;

  const company = await getCompany({ tenantId, companyId });
  if (!company) notFound();

  // Parallel fetch: snabbfakta, tidslinje, första platsens
  // faktureringsadress, senaste ordern, alla kontakter och
  // betalningsvillkor (för "Redigera företagsuppgifter"-modalen).
  // Första platsen speglar företagets primära adress
  // (skapades via /new createCompany).
  const [
    spentAgg,
    totalOrders,
    firstLocation,
    events,
    latestOrderRow,
    allContacts,
    paymentTerms,
    allLocations,
    prevCompany,
    nextCompany,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        tenantId,
        companyId: company.id,
        financialStatus: { notIn: ["VOIDED"] },
      },
    }),
    prisma.order.count({
      where: { tenantId, companyId: company.id },
    }),
    prisma.companyLocation.findFirst({
      where: { tenantId, companyId: company.id },
      orderBy: { createdAt: "asc" },
    }),
    listCompanyEvents({ tenantId, companyId: company.id, take: 50 }),
    prisma.order.findFirst({
      where: { tenantId, companyId: company.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        fulfillmentStatus: true,
        fulfilledAt: true,
        cancelledAt: true,
        metadata: true,
        lineItems: {
          select: {
            id: true,
            title: true,
            variantTitle: true,
            sku: true,
            imageUrl: true,
            quantity: true,
          },
        },
      },
    }),
    listContactsForCompany({ tenantId, companyId: company.id }),
    listAvailableTerms({ tenantId }),
    listLocations({ tenantId, companyId: company.id }),
    // Prev/next — kronologisk ordning per tenant, speglar
    // CustomerDetail-sidans prev/next-logik exakt.
    prisma.company.findFirst({
      where: { tenantId, createdAt: { lt: company.createdAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.company.findFirst({
      where: { tenantId, createdAt: { gt: company.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const totalSpent = spentAgg._sum.totalAmount ?? 0;

  const latestOrder = latestOrderRow
    ? {
        id: latestOrderRow.id,
        orderNumber: latestOrderRow.orderNumber,
        fulfillmentStatus: latestOrderRow.fulfillmentStatus,
        fulfilledAt: latestOrderRow.fulfilledAt?.toISOString() ?? null,
        cancelledAt: latestOrderRow.cancelledAt?.toISOString() ?? null,
        metadata: latestOrderRow.metadata as Record<string, unknown> | null,
        lineItems: latestOrderRow.lineItems,
      }
    : null;

  // Meta-kort i sidebaren: org-nummer lever på första platsens taxId,
  // kontakter är alla unika GuestAccounts kopplade till företagets platser.
  const organizationNumber = firstLocation?.taxId ?? null;
  const contactDisplayName = (c: (typeof allContacts)[number]) => {
    const composed =
      c.guestAccount.name ??
      [c.guestAccount.firstName, c.guestAccount.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    return composed && composed.length > 0 ? composed : c.guestAccount.email;
  };
  const contactPills = (() => {
    const seen = new Set<string>();
    const out: Array<{ guestAccountId: string; name: string }> = [];
    for (const c of allContacts) {
      if (seen.has(c.guestAccount.id)) continue;
      seen.add(c.guestAccount.id);
      out.push({
        guestAccountId: c.guestAccount.id,
        name: contactDisplayName(c),
      });
    }
    return out;
  })();
  const contactCandidates = allContacts.map((c) => ({
    id: c.id,
    guestName: contactDisplayName(c),
    guestEmail: c.guestAccount.email,
    isMainContact: c.isMainContact,
  }));

  const billingInitial = firstLocation
    ? {
        line1: addressFieldFromJson(firstLocation.billingAddress, "line1"),
        line2: addressFieldFromJson(firstLocation.billingAddress, "line2"),
        postalCode: addressFieldFromJson(
          firstLocation.billingAddress,
          "postalCode",
        ),
        city: addressFieldFromJson(firstLocation.billingAddress, "city"),
        country:
          addressFieldFromJson(firstLocation.billingAddress, "country") || "SE",
      }
    : { line1: "", line2: "", postalCode: "", city: "", country: "SE" };

  // Seed för "Redigera företagsuppgifter"-modalen — endast identitets-
  // fälten (namn, externt ID, org-nr). Adress, betalningsvillkor, skatt,
  // taggar och anteckning har egna kort på sidan.
  const editInitial = {
    name: company.name,
    externalId: company.externalId ?? "",
    taxId: firstLocation?.taxId ?? "",
  } as const;
  const tagsInitial = Array.isArray(company.tags) ? [...company.tags] : [];
  const paymentTermsOptions = paymentTerms.map((t) => ({
    id: t.id,
    name: t.name,
  }));
  const billingSettingsInitial = {
    paymentTermsId: firstLocation?.paymentTermsId ?? "",
    taxSetting: firstLocation?.taxSetting ?? ("COLLECT" as const),
  };
  const locationChoices = allLocations.map((l) => ({
    id: l.id,
    name: l.name,
  }));

  // Normalisera events för klient-komponenten (Date → ISO-sträng).
  const eventRows = events.map((e) => ({
    id: e.id,
    type: e.type,
    message: e.message,
    metadata: e.metadata as Record<string, unknown> | null,
    actorUserId: e.actorUserId,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* ── Header — identisk med /new ── */}
        <div className="admin-header pf-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            <a
              href="/customers/companies"
              className="menus-breadcrumb__icon"
              aria-label="Tillbaka till företag"
              style={{ textDecoration: "none" }}
            >
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 22 }}
              >
                domain
              </span>
            </a>
            <EditorIcon
              name="chevron_right"
              size={16}
              style={{
                color: "var(--admin-text-tertiary)",
                flexShrink: 0,
              }}
            />
            <span style={{ marginLeft: 3 }}>{company.name}</span>
          </h1>
          <CompanyHeaderActions
            companyId={company.id}
            prevCompanyId={prevCompany?.id ?? null}
            nextCompanyId={nextCompany?.id ?? null}
          />
        </div>

        {/* ── Snabbfakta-bar — identisk med kundsidans .cst-overview ── */}
        <div className="cst-overview">
          <div className="cst-overview__inner">
            <div className="cst-overview__item">
              <span className="cst-overview__label">Spenderat belopp</span>
              <span className="cst-overview__value">
                {totalSpent > 0
                  ? `${formatPriceDisplay(totalSpent, "SEK")} kr`
                  : "0 kr"}
              </span>
            </div>
            <div className="cst-overview__item">
              <span className="cst-overview__label">Bokningar</span>
              <span className="cst-overview__value">{totalOrders}</span>
            </div>
            <div className="cst-overview__item">
              <span className="cst-overview__label">Kund sedan</span>
              <span className="cst-overview__value">
                {company.createdAt.toLocaleDateString("sv-SE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* ── Body — pf-main + pf-sidebar, samma som kund/order ── */}
        <div className="pf-body">
          <div className="pf-main">
            {/* Senaste bokning — samma plats och layout som kundsidan */}
            <CompanyLatestOrderCard latestOrder={latestOrder} />

            {firstLocation && (
              <BillingAddressEditCard
                companyId={company.id}
                locationId={firstLocation.id}
                initial={billingInitial}
              />
            )}

            <CompanyTimeline companyId={company.id} events={eventRows} />
          </div>

          {/* Sidebar — Meta-kort överst, Anteckningar under.
              Meta-kortet: bolagsnamn, status, org-nr, kontakt-pills, overflow-menu.
              Anteckningar: samma container/modal/position som /new + ordrar. */}
          <div className="pf-sidebar">
            <CompanyMetaCard
              companyId={company.id}
              name={company.name}
              status={company.status}
              orderingApproved={company.orderingApproved}
              organizationNumber={organizationNumber}
              contacts={contactPills}
              contactCandidates={contactCandidates}
              editInitial={editInitial}
              locations={locationChoices}
            />
            <BillingSettingsCard
              companyId={company.id}
              initial={billingSettingsInitial}
              paymentTermsOptions={paymentTermsOptions}
            />
            <CompanyTagsCard
              companyId={company.id}
              initial={tagsInitial}
            />
            <CompanyNoteCard
              companyId={company.id}
              initialNote={company.note}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
