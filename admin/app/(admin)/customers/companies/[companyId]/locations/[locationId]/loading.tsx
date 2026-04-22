import "../../../_components/companies.css";

export default function LocationDetailLoading() {
  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div
          className="admin-header"
          style={{ flexDirection: "column", alignItems: "stretch" }}
        >
          <div className="co-skel co-skel--row" style={{ width: "40%" }} />
          <div className="co-skel co-skel--title" />
        </div>
        <div className="admin-content">
          <div className="co-page">
            <div className="co-skel co-skel--row" style={{ width: "100%" }} />
            <div className="co-grid co-grid--split">
              <div>
                <div className="co-skel co-skel--block" />
                <div className="co-skel co-skel--block" />
              </div>
              <div>
                <div className="co-skel co-skel--block" />
                <div className="co-skel co-skel--block" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
