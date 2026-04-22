import Link from "next/link";
import { prisma } from "@/app/_lib/db/prisma";
import { listCatalogs, listCatalogsForLocation } from "@/app/_lib/companies";
import { EmptyState } from "../../../../_components/EmptyState";
import { formatDateSv } from "../../../../_components/formatters";
import {
  AssignCatalogForm,
  UnassignCatalogButton,
} from "../../../../_components/LocationEditCards";

/**
 * Kataloger tab — catalogs assigned to this location.
 *
 * Queries:
 *   1  location check (inside listCatalogsForLocation)
 *   1  join-table fetch (inside listCatalogsForLocation)
 *   1  CompanyLocationCatalog.findMany with assignedAt (for date column)
 *   1  per-catalog child counts via three groupBy — batched into one
 *      Promise.all so this stays at 3 queries regardless of catalog count.
 *   ─── 4–5 queries, within budget.
 */
export async function LocationCatalogsTab({
  tenantId,
  locationId,
  companyId,
}: {
  tenantId: string;
  locationId: string;
  companyId: string;
}) {
  const [assigned, allCatalogs] = await Promise.all([
    listCatalogsForLocation({
      tenantId,
      companyLocationId: locationId,
    }),
    listCatalogs({ tenantId, take: 100, status: "ACTIVE" }),
  ]);
  const catalogs = assigned;
  const assignedIds = new Set(catalogs.map((c) => c.id));
  const availableToAssign = allCatalogs.catalogs
    .filter((c) => !assignedIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  if (catalogs.length === 0) {
    return (
      <div>
        <AssignCatalogForm
          companyId={companyId}
          locationId={locationId}
          catalogOptions={availableToAssign}
        />
        <EmptyState
          icon="inventory_2"
          title="Inga tilldelade kataloger"
          description="Denna plats får standardpriser."
        />
      </div>
    );
  }

  const catalogIds = catalogs.map((c) => c.id);

  const [assignments, fixedGroups, ruleGroups, inclusionGroups] =
    await Promise.all([
      prisma.companyLocationCatalog.findMany({
        where: { companyLocationId: locationId, catalogId: { in: catalogIds } },
        select: { catalogId: true, createdAt: true },
      }),
      prisma.catalogFixedPrice.groupBy({
        by: ["catalogId"],
        where: { catalogId: { in: catalogIds } },
        _count: { _all: true },
      }),
      prisma.catalogQuantityRule.groupBy({
        by: ["catalogId"],
        where: { catalogId: { in: catalogIds } },
        _count: { _all: true },
      }),
      prisma.catalogInclusion.groupBy({
        by: ["catalogId"],
        where: { catalogId: { in: catalogIds } },
        _count: { _all: true },
      }),
    ]);

  const assignedAtByCatalog = new Map(
    assignments.map((a) => [a.catalogId, a.createdAt]),
  );
  const fixedBy = new Map(
    fixedGroups.map((g) => [g.catalogId, g._count._all]),
  );
  const ruleBy = new Map(
    ruleGroups.map((g) => [g.catalogId, g._count._all]),
  );
  const inclusionBy = new Map(
    inclusionGroups.map((g) => [g.catalogId, g._count._all]),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AssignCatalogForm
        companyId={companyId}
        locationId={locationId}
        catalogOptions={availableToAssign}
      />
      {catalogs.map((c) => {
        const adj =
          c.overallAdjustmentPercent !== null &&
          c.overallAdjustmentPercent !== undefined
            ? `${c.overallAdjustmentPercent.toString()}%`
            : null;
        const statusCls =
          c.status === "ACTIVE" ? "co-badge--green" : "co-badge--muted";
        return (
          <section className="co-card" key={c.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                gap: 12,
              }}
            >
              <h2 className="co-card__title" style={{ margin: 0 }}>
                <Link href={`/catalogs/${c.id}`}>{c.name}</Link>
              </h2>
              <span className={`co-badge ${statusCls}`}>{c.status}</span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Prisjustering</span>
              <span className="co-card__value">
                {adj ?? <span className="co-muted">—</span>}
              </span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Omfattning</span>
              <span className="co-card__value">
                <span
                  className={`co-badge ${c.includeAllProducts ? "co-badge--blue" : "co-badge--muted"}`}
                >
                  {c.includeAllProducts ? "Alla produkter" : "Begränsad"}
                </span>
              </span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Fasta priser</span>
              <span className="co-card__value">{fixedBy.get(c.id) ?? 0}</span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Kvantitetsregler</span>
              <span className="co-card__value">{ruleBy.get(c.id) ?? 0}</span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Inkluderingar</span>
              <span className="co-card__value">
                {inclusionBy.get(c.id) ?? 0}
              </span>
            </div>
            <div className="co-card__row">
              <span className="co-card__label">Tilldelad</span>
              <span className="co-card__value">
                {formatDateSv(assignedAtByCatalog.get(c.id) ?? null)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
              <UnassignCatalogButton
                companyId={companyId}
                locationId={locationId}
                catalogId={c.id}
                catalogName={c.name}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
