import Link from "next/link";
import "../../customers/companies/_components/companies.css";

export default async function CatalogDetailStubPage({
  params,
}: {
  params: Promise<{ catalogId: string }>;
}) {
  const { catalogId } = await params;
  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inventory_2</span>
            Katalog
          </h1>
        </div>
        <div className="admin-content">
          <div className="co-page">
            <div className="co-breadcrumb">
              <Link href="/catalogs">Kataloger</Link>
              <span className="co-breadcrumb__sep">›</span>
              <span>{catalogId}</span>
            </div>
            <div className="co-placeholder">
              <strong>Katalog-sidor kommer i FAS 5</strong>
              <div style={{ marginTop: 4 }}>
                Detaljvy för katalog <code>{catalogId}</code>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
