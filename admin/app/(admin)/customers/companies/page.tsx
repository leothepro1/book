import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { listCompaniesWithMainContacts } from "@/app/_lib/companies";
import CompaniesClient from "./CompaniesClient";
import "../customers.css";
import "../../files/files.css";

/**
 * /admin/customers/companies — B2B companies list.
 *
 * Structured identically to /admin/customers/segments: own page.tsx, own
 * client component, own title, reuses the existing `.cst-*` +
 * `.files-pagination` CSS — no custom table or invented container UI.
 *
 * Server shell: resolves tenant + pre-loads the rows + filter counts the
 * client component needs, then delegates to CompaniesClient which owns
 * interactivity (search, filter switching, pagination).
 */

const PAGE_SIZE = 50;

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; cursor?: string }>;
}) {
  const session = await getCurrentTenant();
  if (!session) redirect("/sign-in");
  const tenantId = session.tenant.id;

  const sp = await searchParams;
  const filter =
    sp.filter === "ACTIVE" ||
    sp.filter === "ARCHIVED" ||
    sp.filter === "pending"
      ? sp.filter
      : "all";
  const q = sp.q?.trim() || undefined;
  const cursor = sp.cursor || undefined;

  const listArgs = {
    tenantId,
    take: PAGE_SIZE,
    cursor,
    search: q,
    ...(filter === "ACTIVE" ? { status: "ACTIVE" as const } : {}),
    ...(filter === "ARCHIVED" ? { status: "ARCHIVED" as const } : {}),
    ...(filter === "pending"
      ? { status: "ACTIVE" as const, orderingApproved: false }
      : {}),
  };

  const [list, totalActive, totalArchived, totalPending] = await Promise.all([
    listCompaniesWithMainContacts(listArgs),
    prisma.company.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.company.count({ where: { tenantId, status: "ARCHIVED" } }),
    prisma.company.count({
      where: { tenantId, status: "ACTIVE", orderingApproved: false },
    }),
  ]);

  const rows = list.companies.map((c) => {
    const g = c.mainContact?.guestAccount;
    const mainName =
      g?.name ??
      [g?.firstName, g?.lastName].filter(Boolean).join(" ").trim() ??
      null;
    return {
      id: c.id,
      name: c.name,
      mainContactName: mainName && mainName.length > 0 ? mainName : null,
      locationCount: c.locationCount,
      createdAt: c.createdAt.toISOString(),
      status: c.status,
      orderingApproved: c.orderingApproved,
    };
  });

  return (
    <div className="admin-page admin-page--no-preview customers-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 22 }}
            >
              domain
            </span>
            Företag
          </h1>
          <div className="admin-actions">
            <Link
              href="/customers/companies/new"
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
            >
              Skapa företag
            </Link>
          </div>
        </div>
        <div className="admin-content">
          <CompaniesClient
            rows={rows}
            currentFilter={filter}
            currentQuery={q ?? ""}
            currentCursor={cursor ?? null}
            nextCursor={list.nextCursor}
            counts={{
              all: totalActive + totalArchived,
              ACTIVE: totalActive,
              ARCHIVED: totalArchived,
              pending: totalPending,
            }}
          />
        </div>
      </div>
    </div>
  );
}
