import { TranslationEditor } from "./TranslationEditor";
import "../translations.css";
import "@/app/(admin)/_components/PublishBar/publish-bar.css";

export const dynamic = "force-dynamic";

export default async function TranslationPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;

  return <TranslationEditor locale={locale} />;
}
