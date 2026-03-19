"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") {
      setMounted(false);
      setAnimState("idle");
    } else if (animState === "enter") {
      setAnimState("idle");
    }
  };

  if (!mounted) return null;

  return (
    <svg
      className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18" height="18" viewBox="0 0 21 21" fill="none" style={{ marginTop: 1 }}
      onAnimationEnd={handleAnimationEnd} aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}
import { EditorIcon } from "@/app/_components/EditorIcon";
import { EditOrganisationModal } from "./EditOrganisationModal";
import {
  getOrganisationData,
  getBusinessEntities,
  createBusinessEntity,
  updateBusinessEntity,
  deleteBusinessEntity,
} from "./actions";
import type { OrganisationDataResponse, BusinessEntityData } from "./actions";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const BUSINESS_TYPES = [
  { value: "hotel", label: "Hotell" },
  { value: "camping", label: "Camping" },
  { value: "resort", label: "Resort" },
  { value: "hostel", label: "Vandrarhem / Hostel" },
  { value: "bnb", label: "Bed & Breakfast" },
  { value: "cabin", label: "Stugby / Cabin Resort" },
  { value: "holiday", label: "Semesteranläggning" },
  { value: "other", label: "Annat" },
];

type OrgView = "overview" | "add-entity" | "edit-entity";

type EntityForm = {
  businessType: string;
  legalName: string;
  nickname: string;
  addressStreet: string;
  addressApartment: string;
  addressPostalCode: string;
  addressCity: string;
};

type BreadcrumbSegment = { label: string; onClick?: () => void };
type OrganisationContentProps = {
  onSubTitleChange?: (title: string | BreadcrumbSegment[] | null) => void;
};

export function OrganisationContent({ onSubTitleChange }: OrganisationContentProps) {
  const [data, setData] = useState<OrganisationDataResponse>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<OrgView>("overview");
  const [entityForm, setEntityForm] = useState<EntityForm>({
    businessType: "",
    legalName: "",
    nickname: "",
    addressStreet: "",
    addressApartment: "",
    addressPostalCode: "",
    addressCity: "",
  });
  const [entities, setEntities] = useState<BusinessEntityData[]>([]);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [originalForm, setOriginalForm] = useState<EntityForm | null>(null);
  const [menuEntityId, setMenuEntityId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showEditOrgModal, setShowEditOrgModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  function goToOverview() {
    setView("overview");
    setEditingEntityId(null);
    onSubTitleChange?.(null);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [result, ents] = await Promise.all([
      getOrganisationData(),
      getBusinessEntities(),
    ]);
    setData(result);
    setEntities(ents);
    setLoading(false);
  }

  // ── Skeleton ──────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <div className="skel" style={{ width: 56, height: 56, borderRadius: 12 }} />
          <div>
            <div className="skel skel--text" style={{ width: 160, height: 16, marginBottom: 6 }} />
            <div className="skel skel--text" style={{ width: 100, height: 12 }} />
          </div>
        </div>
        <div className="skel skel--text" style={{ width: 140, height: 16, marginBottom: 12 }} />
        <div className="skel skel--text" style={{ width: "100%", height: 48, borderRadius: 8 }} />
      </div>
    );
  }

  if (!data) {
    return <p style={{ color: "var(--admin-text-secondary)" }}>Kunde inte ladda organisationsdata.</p>;
  }

  // ── Overview ──────────────────────────────────────────────

  if (view === "overview") {
    return (
      <>
        {/* Org profile header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {data.clerk.logoUrl ? (
              <img
                src={data.clerk.logoUrl}
                alt={data.clerk.name}
                style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }}
              />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 12,
                background: "var(--admin-accent)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 600,
              }}>
                {data.clerk.name[0]?.toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--admin-text)" }}>
                {data.clerk.name}
              </div>
            </div>
            <button
              style={{
                fontFamily: "var(--admin-font)", cursor: "pointer",
                color: "#2783de", background: "#e7f3fb", border: "none",
                borderRadius: 8, padding: "5px 11px", fontSize: 13, fontWeight: 500,
                display: "inline-flex", alignItems: "center", gap: 8,
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,124,215,0.14)"; e.currentTarget.style.color = "#1a6fc2"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#e7f3fb"; e.currentTarget.style.color = "#2783de"; }}
              onClick={() => setShowEditOrgModal(true)}
            >
              Redigera
            </button>
          </div>
        </div>

        {/* Portaladress */}
        {data.tenant.portalSlug && (
          <div style={{ marginBottom: 4 }}>
            <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--admin-text)" }}>
              Portaladress
            </h4>
            <p className="admin-desc" style={{ marginBottom: 8 }}>
              Gästerna når portalen på denna adress.
            </p>
            <a
              href={`https://${data.tenant.portalSlug}.bedfront.com`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 14, fontWeight: 500, color: "#2783de",
                textDecoration: "none",
              }}
            >
              {data.tenant.portalSlug}.bedfront.com
              <EditorIcon name="open_in_new" size={14} style={{ opacity: 0.7 }} />
            </a>
          </div>
        )}

        {/* Företagsenheter */}
        {entities.length === 0 ? (
          /* ── Empty state ── */
          <div>
            <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "var(--admin-text)" }}>
              Företagsenheter
            </h4>
            <p className="admin-desc" style={{ marginBottom: 16 }}>
              Lägg till juridiska personer kopplade till din organisation.
            </p>
            <button
              className="settings-btn--select-pms"
              onClick={() => {
                setView("add-entity");
                onSubTitleChange?.([
                  { label: "Organisation", onClick: goToOverview },
                  { label: "Lägg till juridisk person" },
                ]);
              }}
            >
              Lägg till företagsenhet
            </button>
          </div>
        ) : (
          /* ── Has entities ── */
          <div>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", margin: 0 }}>
                Företagsenheter
              </h4>
              <button
                style={{
                  fontFamily: "var(--admin-font)", cursor: "pointer",
                  color: "#2783de", background: "#e7f3fb", border: "none",
                  borderRadius: 8, padding: "5px 11px", fontSize: 13, fontWeight: 500,
                  display: "inline-flex", alignItems: "center", gap: 8,
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,124,215,0.14)"; e.currentTarget.style.color = "#1a6fc2"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#e7f3fb"; e.currentTarget.style.color = "#2783de"; }}
                onClick={() => {
                  setView("add-entity");
                  onSubTitleChange?.([
                  { label: "Organisation", onClick: goToOverview },
                  { label: "Lägg till juridisk person" },
                ]);
                }}
              >
                Lägg till
              </button>
            </div>

            {/* Table */}
            <div style={{
              border: "1px solid var(--admin-border)",
              borderRadius: 10,
              overflow: "hidden",
            }}>
              {/* Table header */}
              <div style={{
                display: "flex", alignItems: "center",
                padding: "8px 16px",
                background: "var(--admin-surface-hover)",
                borderBottom: "1px solid var(--admin-border)",
                fontSize: 14, fontWeight: 450,
                color: "var(--admin-text-secondary)",
              }}>
                <span style={{ flex: 2, display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>Namn</span>
                <span style={{ width: 160, flexShrink: 0 }}>Typ</span>
                <span style={{ width: 28, flexShrink: 0 }} />
              </div>

              {/* Table rows */}
              {entities.map((entity, i) => {
                const typeLabel = BUSINESS_TYPES.find((t) => t.value === entity.businessType)?.label ?? entity.businessType;
                const addressParts = [entity.addressStreet, entity.addressPostalCode, entity.addressCity].filter(Boolean);
                const fullAddress = addressParts.join(", ");

                return (
                  <button
                    key={entity.id}
                    onClick={() => {
                      setEditingEntityId(entity.id);
                      const formData: EntityForm = {
                        businessType: entity.businessType,
                        legalName: entity.legalName,
                        nickname: entity.nickname ?? "",
                        addressStreet: entity.addressStreet ?? "",
                        addressApartment: entity.addressApartment ?? "",
                        addressPostalCode: entity.addressPostalCode ?? "",
                        addressCity: entity.addressCity ?? "",
                      };
                      setEntityForm(formData);
                      setOriginalForm(formData);
                      setView("edit-entity");
                      onSubTitleChange?.([
                  { label: "Organisation", onClick: goToOverview },
                  { label: "Redigera företagsenhet" },
                ]);
                    }}
                    style={{
                      display: "flex", alignItems: "center",
                      width: "100%", padding: "12px 16px",
                      border: "none", background: "#fff", cursor: "pointer",
                      textAlign: "left",
                      borderBottom: i < entities.length - 1 ? "1px solid var(--admin-border)" : "none",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-surface-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                  >
                    <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                      <EditorIcon name="business" size={20} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)" }}>
                          {entity.legalName}
                        </div>
                        {fullAddress && (
                          <div style={{ fontSize: 12, color: "#303030", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 400 }}>
                            {fullAddress}
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ width: 157, flexShrink: 0, fontSize: 14, color: "#303030" }}>
                      {typeLabel}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPos({ top: rect.bottom + 4, left: rect.right - 120 });
                        setMenuEntityId(menuEntityId === entity.id ? null : entity.id);
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        color: "var(--admin-text-tertiary)", cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-surface-active)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <EditorIcon name="more_horiz" size={20} style={{ color: "#303030" }} />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Context menu portal */}
            {menuEntityId && menuPos && createPortal(
              <>
                {/* Click-outside overlay */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 8999 }}
                  onClick={() => setMenuEntityId(null)}
                />
                <ul
                  style={{
                    position: "fixed",
                    top: menuPos.top,
                    left: menuPos.left,
                    width: 120,
                    background: "var(--admin-surface)",
                    borderRadius: 12,
                    padding: 5,
                    margin: 0,
                    listStyle: "none",
                    zIndex: 9000,
                    boxShadow: "0px 0px 0px 1px rgba(64, 87, 109, .04), 0px 6px 20px -4px rgba(64, 87, 109, .3)",
                    animation: ".12s ease both admin-dropdown-in",
                  }}
                >
                  <li>
                    <button
                      className="admin-dropdown__item"
                      onClick={() => {
                        const entity = entities.find((e) => e.id === menuEntityId);
                        if (entity) {
                          setEditingEntityId(entity.id);
                          const formData: EntityForm = {
                            businessType: entity.businessType,
                            legalName: entity.legalName,
                            nickname: entity.nickname ?? "",
                            addressStreet: entity.addressStreet ?? "",
                            addressApartment: entity.addressApartment ?? "",
                            addressPostalCode: entity.addressPostalCode ?? "",
                            addressCity: entity.addressCity ?? "",
                          };
                          setEntityForm(formData);
                          setOriginalForm(formData);
                          setView("edit-entity");
                          onSubTitleChange?.([
                  { label: "Organisation", onClick: goToOverview },
                  { label: "Redigera företagsenhet" },
                ]);
                        }
                        setMenuEntityId(null);
                      }}
                    >
                      <EditorIcon name="edit" size={18} style={{ color: "var(--admin-text-secondary)" }} />
                      <span style={{ flex: 1 }}>Redigera</span>
                    </button>
                  </li>
                  <li>
                    <button
                      className="admin-dropdown__item"
                      style={{ color: "var(--admin-danger)" }}
                      onClick={() => {
                        setConfirmDeleteId(menuEntityId);
                        setMenuEntityId(null);
                      }}
                    >
                      <EditorIcon name="delete" size={18} />
                      <span style={{ flex: 1 }}>Ta bort</span>
                    </button>
                  </li>
                </ul>
              </>,
              document.body,
            )}
          {/* Delete confirmation modal */}
          {confirmDeleteId && createPortal(
            <div
              style={{
                position: "fixed", inset: 0, zIndex: 200,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => setConfirmDeleteId(null)}
            >
              <div style={{
                position: "absolute", inset: 0,
                background: "var(--admin-overlay)",
                animation: "settings-modal-fade-in 0.15s ease",
              }} />
              <div
                style={{
                  position: "relative", zIndex: 1,
                  background: "var(--admin-surface)",
                  borderRadius: 16, padding: 24, width: 380,
                  animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
                  Ta bort företagsenhet?
                </h3>
                <p style={{ fontSize: 14, color: "var(--admin-text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
                  Företagsenheten tas bort permanent. Detta går inte att ångra.
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    className="settings-btn--outline"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Avbryt
                  </button>
                  <button
                    className="settings-btn--danger-solid"
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      await deleteBusinessEntity(confirmDeleteId);
                      await loadData();
                      setIsDeleting(false);
                      setConfirmDeleteId(null);
                    }}
                  >
                    <ButtonSpinner visible={isDeleting} />
                    Ta bort
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
          </div>
        )}

        <EditOrganisationModal
          isOpen={showEditOrgModal}
          onClose={() => setShowEditOrgModal(false)}
          currentName={data.clerk.name}
          currentLogoUrl={data.clerk.logoUrl || null}
          onSuccess={loadData}
        />
      </>
    );
  }

  // ── Add / Edit entity form ─────────────────────────────────

  const isEditMode = view === "edit-entity";

  return (
    <div>
      <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "var(--admin-text)" }}>
        Företagsinformation
      </h4>

      <div className="admin-form">
        {/* Business type dropdown */}
        <div className="admin-field">
          <label className="admin-label">Vilken typ av verksamhet bedriver du?</label>
          <select
            value={entityForm.businessType}
            onChange={(e) => setEntityForm((f) => ({ ...f, businessType: e.target.value }))}
            className="admin-float-input"
            style={{ padding: "10px 12px", cursor: "pointer" }}
          >
            <option value="">Välj verksamhetstyp...</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Rest of form — only visible after selecting business type */}
        {entityForm.businessType && (
          <>
            <div className="admin-field">
              <label className="admin-label">Registrerat företagsnamn</label>
              <input
                type="text"
                value={entityForm.legalName}
                onChange={(e) => setEntityForm((f) => ({ ...f, legalName: e.target.value }))}
                className="admin-float-input"
                style={{ padding: "10px 12px" }}
              />
            </div>

            <div className="admin-field">
              <label className="admin-label">Smeknamn (valfritt)</label>
              <input
                type="text"
                value={entityForm.nickname}
                onChange={(e) => setEntityForm((f) => ({ ...f, nickname: e.target.value }))}
                className="admin-float-input"
                style={{ padding: "10px 12px" }}
              />
            </div>

            {/* Address with search */}
            <div className="admin-field">
              <label className="admin-label">Gatuadress och husnummer</label>
              <AddressSearchInput
                value={entityForm.addressStreet}
                onSelect={({ street, postcode, city }) => setEntityForm((f) => ({
                  ...f,
                  addressStreet: street,
                  addressPostalCode: postcode,
                  addressCity: city,
                }))}
                onChange={(val) => setEntityForm((f) => ({ ...f, addressStreet: val }))}
              />
            </div>

            <div className="admin-field">
              <label className="admin-label">Lägenhet, våning etc.</label>
              <input
                type="text"
                value={entityForm.addressApartment}
                onChange={(e) => setEntityForm((f) => ({ ...f, addressApartment: e.target.value }))}
                className="admin-float-input"
                style={{ padding: "10px 12px" }}
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div className="admin-field" style={{ flex: 1 }}>
                <label className="admin-label">Postnummer</label>
                <input
                  type="text"
                  value={entityForm.addressPostalCode}
                  onChange={(e) => setEntityForm((f) => ({ ...f, addressPostalCode: e.target.value }))}
                  className="admin-float-input"
                  style={{ padding: "10px 12px" }}
                />
              </div>
              <div className="admin-field" style={{ flex: 1 }}>
                <label className="admin-label">Stad / ort</label>
                <input
                  type="text"
                  value={entityForm.addressCity}
                  onChange={(e) => setEntityForm((f) => ({ ...f, addressCity: e.target.value }))}
                  className="admin-float-input"
                  style={{ padding: "10px 12px" }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      {entityForm.businessType && (
        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
          <button
            className="settings-btn--outline"
            disabled={isCancelling || isCreating}
            onClick={async () => {
              setIsCancelling(true);
              await new Promise((r) => setTimeout(r, 2000));
              setIsCancelling(false);
              setEntityForm({
                businessType: "", legalName: "", nickname: "",
                addressStreet: "", addressApartment: "", addressPostalCode: "", addressCity: "",
              });
              setEditingEntityId(null);
              setView("overview");
              onSubTitleChange?.(null);
            }}
          >
            <ButtonSpinner visible={isCancelling} />
            Avbryt
          </button>
          <button
            className="settings-btn--connect"
            disabled={
              isCreating || isCancelling ||
              !entityForm.legalName.trim() || !entityForm.addressStreet.trim() ||
              (isEditMode && originalForm != null && JSON.stringify(entityForm) === JSON.stringify(originalForm))
            }
            onClick={async () => {
              setIsCreating(true);
              const minWait = new Promise((r) => setTimeout(r, 2000));
              const formData = {
                businessType: entityForm.businessType,
                legalName: entityForm.legalName,
                nickname: entityForm.nickname || undefined,
                addressStreet: entityForm.addressStreet || undefined,
                addressApartment: entityForm.addressApartment || undefined,
                addressPostalCode: entityForm.addressPostalCode || undefined,
                addressCity: entityForm.addressCity || undefined,
              };
              const result = isEditMode && editingEntityId
                ? await updateBusinessEntity(editingEntityId, formData)
                : await createBusinessEntity(formData);
              await minWait;
              setIsCreating(false);
              if (result.ok) {
                setEntityForm({
                  businessType: "", legalName: "", nickname: "",
                  addressStreet: "", addressApartment: "", addressPostalCode: "", addressCity: "",
                });
                setEditingEntityId(null);
                await loadData();
                setView("overview");
                onSubTitleChange?.(null);
              }
            }}
          >
            <ButtonSpinner visible={isCreating} />
            {isEditMode ? "Spara ändringar" : "Skapa företagsenhet"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Address search input (reuses Mapbox geocoding pattern) ──

type GeoResult = {
  place_name: string;
  center: [number, number];
  street: string;
  postcode: string;
  city: string;
};

function parseGeoFeature(f: Record<string, unknown>): GeoResult {
  const place_name = f.place_name as string;
  const center = f.center as [number, number];
  const context = (f.context as Array<{ id: string; text: string }>) ?? [];
  const text = (f.text as string) ?? "";
  const address = (f.address as string) ?? "";

  const postcode = context.find((c) => c.id.startsWith("postcode"))?.text ?? "";
  const city = context.find((c) => c.id.startsWith("place"))?.text ?? "";
  const street = address ? `${text} ${address}` : text;

  return { place_name, center, street, postcode, city };
}

function AddressSearchInput({
  value,
  onSelect,
  onChange,
}: {
  value: string;
  onSelect: (result: { street: string; postcode: string; city: string }) => void;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || !MAPBOX_TOKEN) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=sv&types=address`;
        const res = await fetch(url);
        const data = await res.json();
        const features: GeoResult[] = (data.features || []).map((f: Record<string, unknown>) => parseGeoFeature(f));
        setResults(features);
        setOpen(features.length > 0);
      } catch { setResults([]); setOpen(false); }
    }, 300);
  }, []);

  const handleSelect = (r: GeoResult) => {
    setQuery(r.street);
    setResults([]);
    setOpen(false);
    onSelect({ street: r.street, postcode: r.postcode, city: r.city });
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <EditorIcon
          name="search"
          size={16}
          style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: "var(--admin-text-tertiary)", pointerEvents: "none",
          }}
        />
        <input
          type="text"
          className="admin-float-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); search(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          style={{ padding: "10px 12px 10px 36px", width: "100%" }}
        />
      </div>
      {open && results.length > 0 && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return createPortal(
          <ul
            ref={listRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: rect.width,
              background: "var(--admin-surface)",
              borderRadius: 12,
              padding: 5,
              margin: 0,
              listStyle: "none",
              zIndex: 9000,
              boxShadow: "0px 0px 0px 1px rgba(64, 87, 109, .04), 0px 6px 20px -4px rgba(64, 87, 109, .3)",
            }}
          >
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleSelect(r)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "8px 10px",
                    border: "none", background: "none", cursor: "pointer",
                    borderRadius: 8, textAlign: "left",
                    fontSize: 13, color: "var(--admin-text)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-surface-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <EditorIcon name="location_on" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.place_name}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        );
      })()}
    </div>
  );
}
