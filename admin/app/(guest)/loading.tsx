import AppLoader from "./_components/AppLoader";

export default function Loading() {
  return (
    <div
      style={{
        padding: 24,
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--text)",
      }}
    >
      <AppLoader size={28} />
      <span>Loading…</span>
    </div>
  );
}
