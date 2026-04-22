import "../customers/companies/_components/companies.css";

/**
 * /admin/catalogs — placeholder stub linked from the B2B location Kataloger
 * tab. The full catalog management UI arrives in FAS 5.
 */
export default function CatalogsStubPage() {
  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>inventory_2</span>
            Kataloger
          </h1>
        </div>
        <div className="admin-content">
          <div className="co-page">
            <div className="co-placeholder">
              <strong>Katalog-sidor kommer i FAS 5</strong>
              <div style={{ marginTop: 4 }}>
                Här kommer du kunna skapa prislistor, koppla fasta priser,
                volymregler och tilldela kataloger till företagsplatser.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
