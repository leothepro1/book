"use client";

/**
 * RemoveContactModal — "Ta bort kund" action, opened from CompanyMetaCard.
 *
 * Mirrors AddContactModal's search + portaled dropdown + picked-row
 * pattern so every company action modal behaves the same. The only
 * structural differences:
 *
 *   • Candidate source is the company's own CompanyContact set (passed
 *     in as a prop — companies carry few contacts so client-side
 *     filtering is the correct call), NOT the tenant-wide guest list.
 *   • The current main contact is filtered out; removeContact() throws
 *     on main-contact removal, so gating in the UI saves a round-trip.
 *   • Save button is rendered in the danger variant (red) — removing a
 *     contact deletes the CompanyContact row and, via cascade,
 *     every CompanyLocationAccess grant. The underlying GuestAccount is
 *     preserved, but the membership is gone.
 *
 * Service contract:
 *   removeContactAction → removeContact() inside a $transaction:
 *     1. Tenant-scoped lookup of the contact.
 *     2. Guard against main-contact removal (ValidationError).
 *     3. Defensive check against Company.mainContactId drift.
 *     4. Delete CompanyContact — CompanyLocationAccess cascades.
 *   revalidateCompanyPaths + router.refresh re-render the detail page
 *   with the pill removed from the meta card and a CONTACT_REMOVED
 *   entry appearing in the timeline.
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
import { removeContactAction } from "../actions";
import type { MainContactCandidate } from "./ChangeMainContactModal";
import { CompanyActionModal } from "./CompanyActionModal";

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  contacts: MainContactCandidate[];
}

export function RemoveContactModal({
  open,
  onClose,
  companyId,
  contacts,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [pickedContact, setPickedContact] =
    useState<MainContactCandidate | null>(null);

  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset to a pristine state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setPickedContact(null);
    setSearch("");
    setDropdownOpen(false);
    setIsSaving(false);
    setErrorMessage(null);
  }, [open]);

  // Dismiss the portaled dropdown on outside click. Anchor and portal
  // both count as "inside" — option clicks must not collapse the panel
  // before the click handler fires.
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

  // Keep the portaled dropdown positioned under the input while the
  // page scrolls, resizes, or the modal body scrolls (capture phase
  // catches non-bubbling scroll events).
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

  // Candidates: exclude the current main contact (removeContact throws
  // on main) and apply a case-insensitive substring match on name/email.
  const candidates = useMemo(() => {
    const removable = contacts.filter((c) => !c.isMainContact);
    const q = search.trim().toLowerCase();
    if (!q) return removable;
    return removable.filter(
      (c) =>
        c.guestName.toLowerCase().includes(q) ||
        c.guestEmail.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const onFocusSearch = useCallback(() => setDropdownOpen(true), []);

  const pickContact = useCallback((c: MainContactCandidate) => {
    setPickedContact(c);
    setSearch("");
    setDropdownOpen(false);
  }, []);

  const canSave = pickedContact !== null && !isSaving;

  const handleSave = useCallback(() => {
    if (!canSave || !pickedContact) return;
    setIsSaving(true);
    setErrorMessage(null);
    startTransition(async () => {
      const result = await removeContactAction({
        companyId,
        contactId: pickedContact.id,
      });
      setIsSaving(false);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }, [canSave, companyId, pickedContact, onClose, router]);

  return (
    <CompanyActionModal
      open={open}
      onClose={onClose}
      title="Ta bort kund"
      canSave={canSave}
      isSaving={isSaving}
      onSave={handleSave}
      errorMessage={errorMessage}
      saveLabel="Ta bort"
      saveVariant="danger"
    >
      {/* Search input — identical shell to AddContactModal. */}
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
            onChange={(e) => {
              setSearch(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={onFocusSearch}
            placeholder="Sök kunder"
            disabled={isSaving}
          />
        </div>
      </div>

      {/* Picked contact row — same underlined "Bläddra"-picker look as
          AddContactModal and CompanyCreateForm's main-contact picker. */}
      {pickedContact ? (
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
              {pickedContact.guestName && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--admin-text)",
                    fontWeight: 500,
                  }}
                >
                  {pickedContact.guestName}
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--admin-text-secondary)",
                }}
              >
                {pickedContact.guestEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPickedContact(null)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-text-secondary)",
                display: "flex",
              }}
              aria-label={`Ta bort ${pickedContact.guestName || pickedContact.guestEmail}`}
              disabled={isSaving}
            >
              <EditorIcon name="close" size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Portaled dropdown — escapes modal body overflow + scale
          transform stacking context, identical to AddContactModal. */}
      {dropdownOpen &&
      dropdownRect &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              role="listbox"
              aria-label="Välj kund att ta bort"
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
              {candidates.length === 0 ? (
                <p
                  style={{
                    padding: "12px 14px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--admin-text-tertiary)",
                    margin: 0,
                  }}
                >
                  {contacts.filter((c) => !c.isMainContact).length === 0
                    ? "Inga kunder att ta bort."
                    : "Inga kunder matchar sökningen."}
                </p>
              ) : (
                candidates.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pickContact(item)}
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
                        i < candidates.length - 1
                          ? "1px solid var(--admin-border)"
                          : "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "background var(--duration-fast)",
                    }}
                  >
                    <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                      {item.guestName && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--admin-text)",
                            fontWeight: 500,
                          }}
                        >
                          {item.guestName}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--admin-text-secondary)",
                        }}
                      >
                        {item.guestEmail}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </CompanyActionModal>
  );
}
