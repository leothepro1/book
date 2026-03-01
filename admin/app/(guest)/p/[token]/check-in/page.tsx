import { markCheckedIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ token?: string }> }) {
  const params = await props.params;
  const token = params?.token;

  return (
    <div style={{ padding: 20, color: "var(--text)" }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Check-in</div>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        (Dev) Klicka för att markera bokningen som incheckad. Detta ersätts senare av riktiga check-in flödet.
      </div>

      <form action={async () => { "use server"; await markCheckedIn(token); }}>
        <button
          type="submit"
          style={{
            height: 48,
            padding: "0 16px",
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--button-bg)",
            color: "var(--button-text)",
            fontWeight: 800,
          }}
        >
          Markera som incheckad
        </button>
      </form>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Token: {token ?? "—"}</div>
    </div>
  );
}
