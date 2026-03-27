import "./login.css";
import { prisma } from "@/app/_lib/db/prisma";
import { notFound } from "next/navigation";
import LoginForm from "./LoginForm";

export const revalidate = 300;
export const dynamicParams = true;

export default async function MagicLinkLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!tenant) {
    notFound();
  }

  return <LoginForm tenantId={tenant.id} tenantName={tenant.name} />;
}
