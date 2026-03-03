import { notFound } from "next/navigation";
import PortalHomePage from "../../../(guest)/p/[token]/page";

export const dynamic = "force-dynamic";

export default async function PreviewPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  if (params.slug !== "home") return notFound();

  return (
    <PortalHomePage 
      params={Promise.resolve({ token: "preview" })}
      searchParams={Promise.resolve({ lang: "sv" })}
    />
  );
}
