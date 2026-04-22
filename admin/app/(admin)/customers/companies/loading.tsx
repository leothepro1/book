import "./_components/companies.css";

export default function CompaniesLoading() {
  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="admin-header">
          <div className="co-skel co-skel--title" />
        </div>
        <div className="admin-content">
          <div className="co-page">
            <div className="co-skel co-skel--row" style={{ width: "30%" }} />
            <div className="co-skel co-skel--row" style={{ width: "100%" }} />
            <div className="co-skel co-skel--block" />
            <div className="co-skel co-skel--block" />
          </div>
        </div>
      </div>
    </div>
  );
}
