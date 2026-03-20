import { redirect } from "next/navigation";
import { resolveGuestContext } from "../../_lib/portal/resolveGuestContext";
import GuestPageShell from "../../_components/GuestPageShell";
import AccountClient from "../../p/[token]/account/AccountClient";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

/**
 * Session-driven account page.
 * Mirrors /p/[token]/account/page.tsx but loads data from guest session.
 * Reuses the existing AccountClient component — no duplication.
 */
export default async function SessionAccountPage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");
  if (!ctx.primaryBooking) redirect("/no-booking");

  const booking = ctx.primaryBooking;

  return (
    <GuestPageShell config={ctx.config}>
      <AccountClient
        token={booking.externalId}
        tenantId={ctx.tenant.id}
        guestEmail={ctx.guestAccount.email}
        lang="sv"
        config={ctx.config}
        initial={{
          firstName: booking.firstName ?? "",
          lastName: booking.lastName ?? "",
          guestEmail: booking.guestEmail ?? "",
          phone: booking.guestPhone ?? "",
          street: "",
          postalCode: "",
          city: "",
          country: "",
        }}
      />
      <LogoutButton />
    </GuestPageShell>
  );
}
