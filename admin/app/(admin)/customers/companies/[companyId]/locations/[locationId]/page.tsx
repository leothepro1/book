import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getCompany, getLocation } from "@/app/_lib/companies";
import { TabBar, type TabDef } from "../../../_components/TabBar";
import "../../../_components/companies.css";
import { LocationOverviewTab } from "./_tabs/LocationOverviewTab";
import { LocationContactsTab } from "./_tabs/LocationContactsTab";
import { LocationCatalogsTab } from "./_tabs/LocationCatalogsTab";
import { LocationPaymentTab } from "./_tabs/LocationPaymentTab";
import { LocationCheckoutTab } from "./_tabs/LocationCheckoutTab";
import { LocationTaxTab } from "./_tabs/LocationTaxTab";
import { LocationStoreCreditTab } from "./_tabs/LocationStoreCreditTab";
import { LocationOrdersTab } from "./_tabs/LocationOrdersTab";

type TabKey =
  | "oversikt"
  | "kontakter"
  | "kataloger"
  | "betalning"
  | "checkout"
  | "skatt"
  | "store-credit"
  | "order";

const TABS: TabDef[] = [
  { key: "oversikt", label: "Översikt" },
  { key: "kontakter", label: "Kontakter" },
  { key: "kataloger", label: "Kataloger" },
  { key: "betalning", label: "Betalning" },
  { key: "checkout", label: "Checkout" },
  { key: "skatt", label: "Skatt" },
  { key: "store-credit", label: "Store credit" },
  { key: "order", label: "Order" },
];

function parseTab(v: string | undefined): TabKey {
  const known: TabKey[] = [
    "oversikt",
    "kontakter",
    "kataloger",
    "betalning",
    "checkout",
    "skatt",
    "store-credit",
    "order",
  ];
  return (known as string[]).includes(v ?? "") ? (v as TabKey) : "oversikt";
}

/**
 * /admin/customers/companies/[companyId]/locations/[locationId]
 *
 * 8 tabs. Överview eager, others lazy-by-URL (server refetches on tab
 * switch — no client bundle for tab content, no over-fetching). Cursor
 * params (`?cursor=`) survive tab changes for the order and store-credit
 * tabs via the TabBar's `preserve` map.
 */
export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; locationId: string }>;
  searchParams: Promise<{
    tab?: string;
    cursor?: string;
    onlyUnpaid?: string;
  }>;
}) {
  const session = await getCurrentTenant();
  if (!session) redirect("/sign-in");
  const tenantId = session.tenant.id;

  const { companyId, locationId } = await params;
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  // Two parallel fetches: parent company + this location. Both tenant-scoped.
  const [company, location] = await Promise.all([
    getCompany({ tenantId, companyId }),
    getLocation({ tenantId, locationId }),
  ]);
  if (!company || !location || location.companyId !== company.id) notFound();

  const basePath = `/customers/companies/${companyId}/locations/${locationId}`;

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div
          className="admin-header"
          style={{ flexDirection: "column", alignItems: "stretch" }}
        >
          <div className="co-breadcrumb">
            <Link href="/customers/companies">Företag</Link>
            <span className="co-breadcrumb__sep">›</span>
            <Link href={`/customers/companies/${company.id}`}>
              {company.name}
            </Link>
            <span className="co-breadcrumb__sep">›</span>
            <span>{location.name}</span>
          </div>
          <div className="co-page__header">
            <div>
              <h1 className="co-page__title">{location.name}</h1>
              <div className="co-page__subtitle">
                {location.externalId ? (
                  <>Externt ID: {location.externalId}</>
                ) : (
                  <span className="co-muted">—</span>
                )}
              </div>
            </div>
            {/* TODO(FAS 5): render write-action menu here (edit addresses,
                assign catalog, adjust credit, issue store credit …). */}
            <div className="co-page__actions" data-fas5-actions />
          </div>
        </div>

        <div className="admin-content">
          <div className="co-page">
            <TabBar
              tabs={TABS}
              activeTab={tab}
              basePath={basePath}
              preserve={{}}
            />

            {tab === "oversikt" ? (
              <LocationOverviewTab tenantId={tenantId} location={location} />
            ) : tab === "kontakter" ? (
              <LocationContactsTab
                tenantId={tenantId}
                locationId={location.id}
                companyId={company.id}
              />
            ) : tab === "kataloger" ? (
              <LocationCatalogsTab
                tenantId={tenantId}
                locationId={location.id}
                companyId={company.id}
              />
            ) : tab === "betalning" ? (
              <LocationPaymentTab
                tenantId={tenantId}
                location={location}
              />
            ) : tab === "checkout" ? (
              <LocationCheckoutTab location={location} />
            ) : tab === "skatt" ? (
              <LocationTaxTab location={location} />
            ) : tab === "store-credit" ? (
              <LocationStoreCreditTab
                tenantId={tenantId}
                locationId={location.id}
                companyId={company.id}
                cursor={sp.cursor}
                basePath={`${basePath}?tab=store-credit`}
              />
            ) : (
              <LocationOrdersTab
                tenantId={tenantId}
                locationId={location.id}
                cursor={sp.cursor}
                onlyUnpaid={sp.onlyUnpaid === "true"}
                basePath={`${basePath}?tab=order`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
