"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import { loadBookingSelection, clearBookingSelection } from "@/app/(guest)/_lib/booking/booking-selection";
import "./booking-form.css";

interface BookingFormClientProps {
  tenantId: string;
  categoryId: string;
  categoryName: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  totalAmount: number;
  addons: Array<{ addonId: string; quantity: number }>;
}

export function BookingFormClient({
  tenantId,
  categoryId,
  categoryName,
  ratePlanId,
  checkIn,
  checkOut,
  guests,
  nights,
  totalAmount,
  addons,
}: BookingFormClientProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Hydrate addons from sessionStorage (survives page navigation)
  // Uses lazy initializer — no effect needed, no setState-in-effect
  const [resolvedAddons] = useState(() => {
    if (typeof window === "undefined") return addons;
    const selection = loadBookingSelection(tenantId);
    return selection && selection.categoryId === categoryId ? selection.addons : addons;
  });
  const [resolvedTotal] = useState(() => {
    if (typeof window === "undefined") return totalAmount;
    const selection = loadBookingSelection(tenantId);
    return selection && selection.categoryId === categoryId ? selection.totalAmount : totalAmount;
  });

  // Guest info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/bookings/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            categoryId,
            ratePlanId,
            checkIn,
            checkOut,
            guests,
            guestInfo: {
              firstName,
              lastName,
              email,
              phone: phone || null,
            },
            addons: resolvedAddons.map(({ addonId, quantity }) => ({ addonId, quantity })),
            specialRequests: specialRequests || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "UNKNOWN" }));
          if (data.error === "NO_LONGER_AVAILABLE") {
            setError("Tyvärr är detta boende inte längre tillgängligt för dessa datum.");
          } else if (data.error === "RESTRICTION_VIOLATED") {
            setError(data.message);
          } else if (data.error === "PMS_UNAVAILABLE") {
            setError("Bokningssystemet är tillfälligt otillgängligt. Försök igen om en stund.");
          } else {
            setError(data.message || "Något gick fel. Försök igen.");
          }
          return;
        }

        const { confirmationNumber, portalToken } = await res.json();
        clearBookingSelection();
        router.push(`/stays/confirmation?confirmationNumber=${confirmationNumber}&portalToken=${portalToken}`);
      } catch {
        setError("Nätverksfel. Kontrollera din anslutning och försök igen.");
      }
    });
  };

  return (
    <div className="bf">
      <div className="bf__layout">
        {/* Left — form */}
        <div className="bf__main">
          {step === 1 ? (
            <form onSubmit={handleStep1} className="bf__form">
              <h2 className="bf__heading">Dina uppgifter</h2>
              <div className="bf__row">
                <div className="bf__field">
                  <label className="bf__label">Förnamn *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="bf__input"
                  />
                </div>
                <div className="bf__field">
                  <label className="bf__label">Efternamn *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="bf__input"
                  />
                </div>
              </div>
              <div className="bf__row">
                <div className="bf__field">
                  <label className="bf__label">E-post *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bf__input"
                  />
                </div>
                <div className="bf__field">
                  <label className="bf__label">Telefon</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bf__input"
                  />
                </div>
              </div>
              <div className="bf__field">
                <label className="bf__label">Eventuella önskemål</label>
                <textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  className="bf__textarea"
                  rows={3}
                />
              </div>
              <button type="submit" className="bf__btn">
                Fortsätt
              </button>
            </form>
          ) : (
            <div className="bf__review">
              <h2 className="bf__heading">Granska och bekräfta</h2>

              {/* Booking summary */}
              <div className="bf__summary-card">
                <div className="bf__summary-row">
                  <span className="bf__summary-label">Boende</span>
                  <span>{categoryName}</span>
                </div>
                <div className="bf__summary-row">
                  <span className="bf__summary-label">Datum</span>
                  <span>{formatDateRange(new Date(checkIn), new Date(checkOut))}</span>
                </div>
                <div className="bf__summary-row">
                  <span className="bf__summary-label">Nätter</span>
                  <span>{nights}</span>
                </div>
                <div className="bf__summary-row">
                  <span className="bf__summary-label">Gäster</span>
                  <span>{guests}</span>
                </div>
                <div className="bf__summary-divider" />
                <div className="bf__summary-row bf__summary-row--total">
                  <span>Totalt</span>
                  <span>{formatPriceDisplay(resolvedTotal)} kr</span>
                </div>
              </div>

              {/* Guest info */}
              <div className="bf__guest-info">
                <h3 className="bf__subheading">Gästuppgifter</h3>
                <p>{firstName} {lastName}</p>
                <p>{email}</p>
                {phone && <p>{phone}</p>}
                {specialRequests && <p className="bf__requests">{specialRequests}</p>}
                <button className="bf__edit-link" onClick={() => setStep(1)}>Ändra</button>
              </div>

              {error && (
                <div className="bf__error">{error}</div>
              )}

              <button
                className="bf__btn"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? "Bokar..." : "Bekräfta bokning"}
              </button>
            </div>
          )}
        </div>

        {/* Right — sticky summary */}
        <div className="bf__sidebar">
          <div className="bf__sidebar-card">
            <div className="bf__sidebar-title">{categoryName}</div>
            <div className="bf__sidebar-dates">
              {formatDateRange(new Date(checkIn), new Date(checkOut))} · {nights} nätter · {guests} gäster
            </div>
            <div className="bf__sidebar-divider" />
            <div className="bf__sidebar-total">
              <span>Totalt</span>
              <span>{formatPriceDisplay(resolvedTotal)} kr</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
