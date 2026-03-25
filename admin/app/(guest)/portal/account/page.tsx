import { redirect } from "next/navigation";
import { resolveGuestContext } from "../../_lib/portal/resolveGuestContext";
import GuestPageShell from "../../_components/GuestPageShell";
import ProfileForm from "./ProfileForm";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

/**
 * Session-driven account page.
 * Shows guest profile from GuestAccount (editable).
 * Works even if the guest has no bookings (only orders).
 */
export default async function SessionAccountPage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");

  const { guestAccount } = ctx;

  return (
    <GuestPageShell config={ctx.config}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "clamp(2rem, 5vw, 3rem) 1rem" }}>
        <h1 style={{ fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)", fontWeight: 600, margin: "0 0 1.5rem", color: "var(--text)" }}>
          Mitt konto
        </h1>
        <ProfileForm
          initial={{
            firstName: guestAccount.firstName ?? "",
            lastName: guestAccount.lastName ?? "",
            email: guestAccount.email,
            phone: guestAccount.phone ?? "",
            address1: guestAccount.address1 ?? "",
            city: guestAccount.city ?? "",
            postalCode: guestAccount.postalCode ?? "",
            country: guestAccount.country ?? "SE",
          }}
        />
        <LogoutButton />
      </div>
    </GuestPageShell>
  );
}
