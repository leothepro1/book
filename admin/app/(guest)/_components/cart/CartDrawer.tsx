"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useCart } from "@/app/(guest)/_lib/cart/CartContext";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import "./cart-drawer.css";

export function CartDrawer({ currency = "SEK" }: { currency?: string }) {
  const {
    cart,
    removeFromCart,
    updateQuantity,
    itemCount,
    cartTotal,
    isOpen,
    closeCart,
  } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Idempotency key — regenerated when cart items change
  const checkoutIdempotencyKey = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    checkoutIdempotencyKey.current = crypto.randomUUID();
  }, [cart.items]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, closeCart]);

  const handleCheckout = () => {
    setCheckoutError(null);
    startTransition(async () => {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": checkoutIdempotencyKey.current,
        },
        body: JSON.stringify({
          items: cart.items,
          tenantId: cart.tenantId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "UNKNOWN" }));
        if (data.error === "STRIPE_NOT_CONFIGURED") {
          setCheckoutError("Betalning är inte tillgänglig just nu. Kontakta hotellet.");
        } else if (data.errors) {
          setCheckoutError("Varukorgen innehåller artiklar som inte längre är tillgängliga. Uppdatera och försök igen.");
        } else {
          setCheckoutError(data.message || "Något gick fel. Försök igen.");
        }
        return;
      }

      const { url } = await res.json();
      // Regenerate key so returning from Stripe starts a fresh attempt
      checkoutIdempotencyKey.current = crypto.randomUUID();
      if (url) window.location.href = url;
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`cd__backdrop${isOpen ? " cd__backdrop--open" : ""}`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`cd${isOpen ? " cd--open" : ""}`}
        role="dialog"
        aria-label="Varukorg"
        aria-modal="true"
      >
        {/* Header */}
        <div className="cd__header">
          <h2 className="cd__heading">Varukorg ({itemCount})</h2>
          <button
            className="cd__close"
            onClick={closeCart}
            aria-label="Stäng varukorg"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
              close
            </span>
          </button>
        </div>

        {/* Items */}
        {cart.items.length === 0 ? (
          <div className="cd__empty">
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 48, opacity: 0.2 }}
            >
              shopping_bag
            </span>
            <p>Din varukorg är tom</p>
          </div>
        ) : (
          <div className="cd__items">
            {cart.items.map((item) => (
              <div key={item.id} className="cd__item">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="cd__item-img"
                  />
                )}
                <div className="cd__item-info">
                  <div className="cd__item-title">{item.title}</div>
                  {item.variantTitle && (
                    <div className="cd__item-variant">{item.variantTitle}</div>
                  )}
                  <div className="cd__item-price">
                    {formatPriceDisplay(item.unitAmount, currency)} kr
                  </div>
                </div>

                {/* Quantity stepper */}
                <div className="cd__qty">
                  <button
                    className="cd__qty-btn"
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    aria-label="Minska antal"
                  >
                    {item.quantity === 1 ? (
                      <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                        delete
                      </span>
                    ) : (
                      "−"
                    )}
                  </button>
                  <span className="cd__qty-val">{item.quantity}</span>
                  <button
                    className="cd__qty-btn"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    aria-label="Öka antal"
                  >
                    +
                  </button>
                </div>

                {/* Remove */}
                <button
                  className="cd__remove"
                  onClick={() => removeFromCart(item.id)}
                  aria-label={`Ta bort ${item.title}`}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>
                    close
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {cart.items.length > 0 && (
          <div className="cd__footer">
            {checkoutError && (
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--error, #dc2626)",
                  padding: "0.5rem 0.75rem",
                  background: "color-mix(in srgb, var(--error, #dc2626) 6%, transparent)",
                  borderRadius: 8,
                }}
              >
                {checkoutError}
              </div>
            )}
            <div className="cd__subtotal">
              <span>Delsumma</span>
              <span className="cd__subtotal-amount">
                {formatPriceDisplay(cartTotal, currency)} kr
              </span>
            </div>
            <button
              className="cd__checkout-btn"
              onClick={handleCheckout}
              disabled={isPending}
            >
              {isPending ? "Laddar..." : "Gå till kassan"}
            </button>
            <button className="cd__continue-btn" onClick={closeCart}>
              Fortsätt shoppa
            </button>
          </div>
        )}
      </div>
    </>
  );
}
