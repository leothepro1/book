import { CustomerDetailClient } from "./CustomerDetailClient";
import "../customers.css";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailClient customerId={id} />;
}
