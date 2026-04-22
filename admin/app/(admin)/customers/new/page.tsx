import CustomerCreateForm from "./CustomerCreateForm";

/**
 * /admin/customers/new
 *
 * Thin server shell — all interactivity lives in CustomerCreateForm.
 * Speglar /customers/companies/new exakt.
 */
export default function NewCustomerPage() {
  return <CustomerCreateForm />;
}
