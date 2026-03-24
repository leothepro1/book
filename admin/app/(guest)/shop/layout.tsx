import type { ReactNode } from "react";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { CartProvider } from "../_lib/cart/CartContext";
import { CartDrawer } from "../_components/cart/CartDrawer";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Shop layout — wraps all public storefront pages (/shop/*).
 * Resolves tenant from subdomain and provides CartContext.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  return (
    <CartProvider tenantId={tenant.id}>
      {children}
      <CartDrawer currency={tenant.settings && typeof tenant.settings === "object" ? "SEK" : "SEK"} />
    </CartProvider>
  );
}
