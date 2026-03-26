import { getProduct } from "@/app/_lib/products";
import { notFound } from "next/navigation";
import ProductForm from "../../products/_components/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const serialized = JSON.parse(JSON.stringify(product));

  return <ProductForm product={serialized} basePath="/properties" />;
}
