export default function Page({
  params,
}: {
  params: { token: string };
}) {
  return (
    <div>
      <h1>Guest Portal</h1>
      <p>Token: {params.token}</p>
    </div>
  );
}