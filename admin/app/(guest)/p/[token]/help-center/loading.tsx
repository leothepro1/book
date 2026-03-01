import AppLoader from "../../../_components/AppLoader";

export default function Loading() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
      }}
    >
      <AppLoader size={96} colorVar="--text" ariaLabel="Laddar" />
    </div>
  );
}
