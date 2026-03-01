import AppLoader from "../../_components/AppLoader";

export default function Loading() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        zIndex: 1,
      }}
    >
      <div style={{ transform: "scale(2)" }}>
        <AppLoader size={48} colorVar="--text" ariaLabel="Laddar portal" />
      </div>
    </div>
  );
}
