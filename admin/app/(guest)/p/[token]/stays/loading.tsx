export default function Loading() {
  return (
    <div className="g-container">
      <h1 className="g-heading" style={{ fontSize: 22, marginBottom: 16 }}>
        Stays
      </h1>

      <div style={{ display: "grid", gap: 14 }}>
        {[1,2,3].map((i) => (
          <div key={i} className="g-stayCard">
            <div className="g-skeleton g-stayImage" />
            <div style={{ display: "grid", gap: 8 }}>
              <div className="g-skeleton" style={{ height: 18, width: "60%" }} />
              <div className="g-skeleton" style={{ height: 14, width: "40%" }} />
              <div className="g-skeleton" style={{ height: 14, width: "30%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
