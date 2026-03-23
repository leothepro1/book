import { getProduct } from "@/app/_lib/products";
import { notFound } from "next/navigation";
import ProductForm from "../_components/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  // Serialize dates for client component
  const serialized = JSON.parse(JSON.stringify(product));

  return <ProductForm product={serialized} />;
}
