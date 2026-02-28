import { PrismaClient } from "@prisma/client";
import { getTenantConfig } from "../../../_lib/tenant";
import AccountClient from "./AccountClient";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export default async function Page(props: {
  params: Promise<{ token?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const searchParams = (await props.searchParams) ?? undefined;

  const token = params?.token;
  const lang = (searchParams?.lang === "en" ? "en" : "sv") as "sv" | "en";

  const booking = await prisma.booking.findFirst({
    where: token ? { id: token } : undefined,
    orderBy: { createdAt: "desc" },
    include: { tenant: true },
  });

  if (!booking) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        {lang === "en" ? "No booking found." : "Ingen bokning hittades."}
      </div>
    );
  }

  const config = await getTenantConfig(booking.tenantId ?? "default");

  const latest = await prisma.booking.findFirst({
    where: { tenantId: booking.tenantId, guestEmail: booking.guestEmail },
    orderBy: { arrival: "desc" },
  });

  const source = latest ?? booking;

  return (
    <AccountClient
      token={booking.id}
      tenantId={booking.tenantId}
      guestEmail={booking.guestEmail}
      lang={lang}
      config={config}
      initial={{
        firstName: source.firstName ?? "",
        lastName: source.lastName ?? "",
        guestEmail: source.guestEmail ?? "",
        phone: source.phone ?? "",
        street: source.street ?? "",
        postalCode: source.postalCode ?? "",
        city: source.city ?? "",
        country: source.country ?? "",
      }}
    />
  );
}
