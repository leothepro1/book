"use client";

/**
 * AddContactModal — "Lägg till kund" action, opened from CompanyMetaCard.
 *
 * A single search input with a floating results dropdown. Admin types a
 * name or email, picks a candidate from the dropdown, and the picked
 * customer is placed below the input as a pill. Spara becomes active
 * when a customer is selected AND at least one location is picked
 * (locations are auto-selected when the company has a single location,
 * so the picker is hidden in that common case).
 *
 * Why only "existing customers":
 *   A GuestAccount may belong to at MOST one Company in this tenant
 *   (enforced by unique index + cross-company pre-check in
 *   createContact). The picker therefore filters the tenant's guests to
 *   those with zero CompanyContact rows anywhere — the exact eligible
 *   set. Creating a brand-new GuestAccount on the fly is intentionally
 *   NOT offered here: onboarding a new customer to the platform is a
 *   separate flow, and collapsing the two blurs the mental model.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  addContactToCompanyAction,
  searchAddableGuestsAction,
} from "../actions";
import { CompanyActionModal } from "./CompanyActionModal";

export interface LocationChoice {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  locations: LocationChoice[];
}

interface GuestOption {
  id: string;
  name: string;
  email: string;
}

export function AddContactModal({
  open,
  onClose,
  companyId,
  locations,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [pickedGuest, setPickedGuest] = useState<GuestOption | null>(null);

  // Search state. `dropdownOpen` controls visibility; `results` is the
  // last returned candidate list; `loading` drives the spinner while the
  // debounced call is in flight.
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GuestOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Portal-positioned dropdown: absolute-inside-modal gets clipped by
  // `.co-modal__body { overflow-y: auto }`. Rendering through a body-
  // level portal + position:fixed from the anchor's bounding rect makes
  // the dropdown float above the modal and the backdrop. Recomputed on
  // every open, on window resize, and while the modal body scrolls so
  // it tracks the input even when the form grows.
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Location selection. Single-location companies skip the picker and
  // auto-grant access; multi-location companies start with the first
  // location pre-selected so Spara is reachable without extra clicks.
  const [pickedLocationIds, setPickedLocationIds] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset to a pristine state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setPickedGuest(null);
    setSearch("");
    setResults([]);
    setLoading(false);
    setDropdownOpen(false);
    setPickedLocationIds(
      locations.length > 0 ? [locations[0].id] : [],
    );
    setIsSaving(false);
    setErrorMessage(null);
  }, [open, locations]);

  // Close the dropdown on outside click (keeps the picked guest state).
  // Both the anchor (search input) and the portaled dropdown count as
  // "inside" — clicking an option must not collapse the panel before
  // the click handler fires.
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !anchorRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Compute the dropdown's fixed viewport position from the anchor's
  // bounding rect. Re-runs on open, on window resize, and on scroll
  // anywhere in the page (capture phase catches the modal body scroll
  // which does not bubble). useLayoutEffect so the portal never paints
  // at the wrong position for a frame.
  useLayoutEffect(() => {
    if (!dropdownOpen) {
      setDropdownRect(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropdownRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [dropdownOpen]);

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    [],
  );

  const runSearch = useCallback((query: string) => {
    setSearch(query);
    setDropdownOpen(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await searchAddableGuestsAction(query);
      setResults(r);
      setLoading(false);
    }, 250);
  }, []);

  const onFocusSearch = useCallback(() => {
    setDropdownOpen(true);
    // Prime with an initial set if we haven't fetched anything yet.
    if (results.length === 0 && !loading && search === "") {
      runSearch("");
    }
  }, [results.length, loading, search, runSearch]);

  const pickGuest = useCallback((g: GuestOption) => {
    setPickedGuest(g);
    setSearch("");
    setResults([]);
    setDropdownOpen(false);
  }, []);

  const toggleLocation = useCallback((id: string) => {
    setPickedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const canSave = useMemo(() => {
    if (isSaving) return false;
    if (pickedLocationIds.length === 0) return false;
    return pickedGuest !== null;
  }, [isSaving, pickedGuest, pickedLocationIds]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    setIsSaving(true);
    setErrorMessage(null);
    startTransition(async () => {
      const result = await addContactToCompanyAction({
        companyId,
        contact: { guestAccountId: pickedGuest!.id },
        locationIds: pickedLocationIds,
      });
      setIsSaving(false);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }, [canSave, companyId, pickedGuest, pickedLocationIds, onClose, router]);

  const multiLocation = locations.length > 1;

  return (
    <CompanyActionModal
      open={open}
      onClose={onClose}
      title="Lägg till kund"
      canSave={canSave}
      isSaving={isSaving}
      onSave={handleSave}
      errorMessage={errorMessage}
      saveLabel="Lägg till"
    >
      {/* Search + floating dropdown */}
      <div ref={anchorRef} style={{ position: "relative" }}>
        <div className="pf-collection-trigger">
          <EditorIcon
            name="search"
            size={18}
            style={{
              color: "var(--admin-text-tertiary)",
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            className="pf-collection-trigger__input"
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            onFocus={onFocusSearch}
            placeholder="Sök kunder"
            disabled={isSaving}
          />
        </div>

      </div>

      {/* Dropdown — portaled to document.body so it escapes the modal
          body's overflow clipping and the modal scale-transform stacking
          context. Positioned with fixed coords derived from the anchor. */}
      {dropdownOpen &&
      dropdownRect &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              aria-label="Välj kund"
              style={{
                position: "fixed",
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
                zIndex: 1100,
                background: "var(--admin-surface)",
                border: "1px solid var(--admin-border)",
                borderRadius: 8,
                boxShadow:
                  "0 20px 24px #1919190d, 0 5px 8px #19191907, 0 0 0 1px #2a1c0012",
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {loading && results.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`skel-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderBottom:
                        i < 2 ? "1px solid var(--admin-border)" : "none",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 12,
                        borderRadius: 4,
                        background: "#e8e8e8",
                        animation:
                          "skeleton-shimmer 1.2s ease-in-out infinite",
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  </div>
                ))
              ) : results.length === 0 ? (
                <p
                  style={{
                    padding: "12px 14px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--admin-text-tertiary)",
                    margin: 0,
                  }}
                >
                  {search.trim()
                    ? "Inga kunder matchar sökningen."
                    : "Inga lediga kunder att lägga till."}
                </p>
              ) : (
                results.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pickGuest(item)}
                    disabled={isSaving}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "10px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom:
                        i < results.length - 1
                          ? "1px solid var(--admin-border)"
                          : "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "background var(--duration-fast)",
                    }}
                  >
                    <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                      {item.name && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--admin-text)",
                            fontWeight: 500,
                          }}
                        >
                          {item.name}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--admin-text-secondary)",
                        }}
                      >
                        {item.email}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}

      {/* Picked guest — matches the "Bläddra"-picker row style used in
          CompanyCreateForm: an underlined text row, no container bg. */}
      {pickedGuest ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            marginTop: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 0",
              borderBottom: "1px solid var(--admin-border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {pickedGuest.name && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--admin-text)",
                    fontWeight: 500,
                  }}
                >
                  {pickedGuest.name}
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--admin-text-secondary)",
                }}
              >
                {pickedGuest.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPickedGuest(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-text-secondary)",
                display: "flex",
              }}
              aria-label={`Ta bort ${pickedGuest.name || pickedGuest.email}`}
              disabled={isSaving}
            >
              <EditorIcon name="close" size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {multiLocation ? (
        <LocationPicker
          locations={locations}
          selectedIds={pickedLocationIds}
          onToggle={toggleLocation}
          disabled={isSaving}
        />
      ) : null}
    </CompanyActionModal>
  );
}

// ── Location picker (only when >1 locations) ──────────────────────

function LocationPicker({
  locations,
  selectedIds,
  onToggle,
  disabled,
}: {
  locations: LocationChoice[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <div
        className="admin-label"
        style={{
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Platser kunden har åtkomst till
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          border: "1px solid var(--admin-border)",
          borderRadius: 8,
          padding: 4,
        }}
      >
        {locations.map((loc) => {
          const selected = selectedIds.includes(loc.id);
          return (
            <label
              key={loc.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                cursor: disabled ? "not-allowed" : "pointer",
                fontSize: 13,
                color: "var(--admin-text)",
                background: selected
                  ? "color-mix(in srgb, var(--admin-accent) 8%, transparent)"
                  : "transparent",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(loc.id)}
                disabled={disabled}
                style={{ cursor: disabled ? "not-allowed" : "pointer" }}
              />
              <span>{loc.name}</span>
            </label>
          );
        })}
      </div>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 12,
          color: "var(--admin-text-tertiary)",
        }}
      >
        Kunden får fullständig behörighet att handla på valda platser. Fler
        platser kan läggas till senare.
      </p>
    </div>
  );
}
