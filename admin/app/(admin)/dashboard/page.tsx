import { getCurrentTenant } from "../_lib/tenant";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const tenantData = await getCurrentTenant();

  if (!tenantData) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="font-semibold text-yellow-900 mb-2">Ingen organization vald</h3>
          <p className="text-yellow-800 mb-4">
            Du måste skapa eller välja en organization för att komma åt dashboarden.
          </p>
          <p className="text-sm text-yellow-700">
            Gå till Clerk och skapa en organization, eller välj en befintlig organization i menyn.
          </p>
        </div>
      </div>
    );
  }

  const { tenant, clerkOrgId } = tenantData;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Din organization</h2>
        <div className="space-y-2">
          <p><span className="font-medium">Namn:</span> {tenant.name}</p>
          <p><span className="font-medium">Slug:</span> {tenant.slug}</p>
          <p><span className="font-medium">Clerk Org ID:</span> <code className="text-xs bg-gray-100 px-2 py-1 rounded">{clerkOrgId}</code></p>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <h3 className="font-semibold text-green-900 mb-2">✅ Clerk Organizations fungerar!</h3>
        <p className="text-sm text-green-800 mb-4">
          Du ser detta eftersom:
        </p>
        <ul className="list-disc list-inside text-sm text-green-800 space-y-1">
          <li>Du är inloggad via Clerk</li>
          <li>Du är medlem i en Clerk Organization</li>
          <li>Organization är kopplad till en Tenant i databasen</li>
          <li>Alla i din organization ser samma data och settings</li>
        </ul>
      </div>
    </div>
  );
}
