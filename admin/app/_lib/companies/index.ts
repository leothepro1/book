/**
 * Companies (B2B "Företag") — public barrel.
 *
 * Callers outside this domain import ONLY from here. Internal helpers stay
 * private to the domain files.
 *
 * FAS 5.5: 3-layer contact model. The old `CompanyLocationContact` surface is
 * gone; callers now compose `CompanyContact` (per-company membership) +
 * `CompanyLocationAccess` (per-location grants). `ContactRole` /
 * `LocationPermission` / `ROLE_PERMISSIONS` were deleted — access is binary.
 */

export * from "./types";

export {
  createCompany,
  getCompany,
  listCompanies,
  updateCompany,
  updateCompanyProfile,
  archiveCompany,
  unarchiveCompany,
  setMainContact,
  listCompaniesWithMainContacts,
  getCompanyOverviewStats,
} from "./company";
export type { CompanyListRow } from "./company";

export {
  createLocation,
  getLocation,
  listLocations,
  updateLocation,
  deleteLocation,
  listLocationsForCompanyWithSummary,
  getLocationOverviewStats,
  getLocationOverviewBundle,
} from "./location";
export type { CompanyLocationSummaryRow } from "./location";

export {
  getStoreCreditBalance,
  listTransactionsForLocation,
  issueCredit,
} from "./store-credit";
export type {
  StoreCreditTransaction,
  StoreCreditReason,
} from "./store-credit";

export { listOrdersForLocation } from "./orders";

export { mapServiceErrorToMessage } from "./error-messages";

export { createCompanyEvent, listCompanyEvents } from "./events";
export type { CompanyEventType } from "./events";

// ── Contacts (3-layer) ──────────────────────────────────────────
export {
  createContact,
  updateContact,
  removeContact,
  listContactsForCompany,
  listGuestsWithoutCompany,
  getContactByGuestAndCompany,
  getCompanyForGuest,
  resolveGuestCompanyContext,
} from "./contact";

// ── Location access ─────────────────────────────────────────────
export {
  grantAccess,
  revokeAccess,
  listAccessForContact,
  listContactsWithAccessToLocation,
  hasAccess,
} from "./location-access";

export {
  listAvailableTerms,
  createCustomTerm,
  getTerms,
  snapshotTerms,
  computeDueDate,
} from "./payment-terms";

export {
  createCatalog,
  getCatalog,
  listCatalogs,
  updateCatalog,
  activateCatalog,
  archiveCatalog,
  deleteCatalog,
  setFixedPrice,
  removeFixedPrice,
  setQuantityRule,
  removeQuantityRule,
  addInclusion,
  removeInclusion,
} from "./catalog";

export {
  assignCatalogToLocation,
  unassignCatalog,
  listCatalogsForLocation,
  listLocationsForCatalog,
} from "./catalog-assignment";
