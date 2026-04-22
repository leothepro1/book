import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { listAvailableTerms } from "@/app/_lib/companies";
import CompanyCreateForm from "./CompanyCreateForm";

/**
 * /admin/customers/companies/new
 *
 * Server shell: resolves tenant, preloads the payment-terms options the
 * form's "Betalningsvillkor" section needs, then delegates to the client
 * form. Mirrors the products/accommodations pattern where the page.tsx is
 * a thin wrapper around a shared form component.
 */
export default async function NewCompanyPage() {
  const session = await getCurrentTenant();
  if (!session) redirect("/sign-in");

  const paymentTerms = await listAvailableTerms({ tenantId: session.tenant.id });

  return (
    <CompanyCreateForm
      paymentTermsOptions={paymentTerms.map((t) => ({
        id: t.id,
        name: t.name,
      }))}
    />
  );
}
