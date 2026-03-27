import "./error.css";

const MESSAGES: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "Ogiltig länk",
    body: "Länken är ogiltig.",
  },
  expired: {
    title: "Länken har gått ut",
    body: "Länken har gått ut. Begär en ny länk.",
  },
  used: {
    title: "Redan använd",
    body: "Länken har redan använts. Begär en ny länk.",
  },
};

const DEFAULT_MESSAGE = {
  title: "Något gick fel",
  body: "Länken kunde inte verifieras.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const msg = (reason && MESSAGES[reason]) || DEFAULT_MESSAGE;

  return (
    <div className="auth-error">
      <div className="auth-error__card">
        <h1 className="auth-error__title">{msg.title}</h1>
        <p className="auth-error__body">{msg.body}</p>
      </div>
    </div>
  );
}
