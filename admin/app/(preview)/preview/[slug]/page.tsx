import { notFound } from "next/navigation";
import PortalHomePage from "../../../(guest)/p/[token]/page";
import StaysPage from "../../../(guest)/p/[token]/stays/page";
import AccountPage from "../../../(guest)/p/[token]/account/page";
import HelpCenterPage from "../../../(guest)/p/[token]/help-center/page";
import SupportPage from "../../../(guest)/p/[token]/support/page";
import CheckInPage from "../../../(guest)/check-in/page";
import LoginPage from "../../../(guest)/login/page";
import { ProductPreviewPage } from "./ProductPreviewPage";

export const dynamic = "force-dynamic";

const PREVIEW_TOKEN = "preview";

export default async function PreviewPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const previewParams = Promise.resolve({ token: PREVIEW_TOKEN });

  console.log(`[PreviewPage] Rendering slug="${params.slug}" at ${new Date().toISOString()}`);

  switch (params.slug) {
    case "home":
      return <PortalHomePage params={previewParams} />;
    case "stays":
      return <StaysPage params={previewParams} />;
    case "account":
      return <AccountPage params={previewParams} />;
    case "help-center":
      return <HelpCenterPage />;
    case "support":
      return <SupportPage />;
    case "check-in":
      return <CheckInPage />;
    case "login":
      return <LoginPage searchParams={props.searchParams} />;
    case "product":
      return <ProductPreviewPage />;
    default:
      return notFound();
  }
}
