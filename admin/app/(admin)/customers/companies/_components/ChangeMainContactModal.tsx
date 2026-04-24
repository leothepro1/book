"use client";

/**
 * ChangeMainContactModal — promote one of the company's existing contacts
 * to main contact via a picker-style modal.
 *
 * Candidates are the CompanyContact rows of this company, MINUS the row
 * currently marked as main. The picker mirrors the visual shell used when
 * creating a company (search input + row list), but scoped to the pre-
 * loaded contact set — companies carry small contact counts, so filtering
 * client-side is both cheap and avoids an additional server round-trip.
 *
 * Concurrency/race safety: `setMainContactAction` runs as a 3-step DB
 * transaction server-side that enforces `isMainContact` uniqueness via a
 * partial unique index. Two staff promoting concurrently cannot both win.
 *
 * On success: close modal, router.refresh() to re-render the detail page
 * with the new main contact reflected in pills, event timeline, and meta
 * card. `setMainContactAction` already calls revalidatePath — refresh
 * forces the client to pick up the new server render.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { setMainContactAction } from "../actions";
import { CompanyActionModal } from "./CompanyActionModal";

export interface MainContactCandidate {
  id: string;
  guestName: string;
  guestEmail: string;
  isMainContact: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  contacts: MainContactCandidate[];
}

export function ChangeMainContactModal({
  open,
  onClose,
  companyId,
  contacts,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset state each time the modal opens so stale picks or errors from a
  // previous interaction never leak into a new session.
  useEffect(() => {
    if (open) {
      setPickedId(null);
      setSearch("");
      setErrorMessage(null);
      setIsSaving(false);
    }
  }, [open]);

  // Candidates: exclude the current main contact. Client-side filter by
  // name or email — companies carry ≤ a few dozen contacts in practice.
  const candidates = useMemo(() => {
    const notMain = contacts.filter((c) => !c.isMainContact);
    const q = search.trim().toLowerCase();
    if (!q) return notMain;
    return notMain.filter(
      (c) =>
        c.guestName.toLowerCase().includes(q) ||
        c.guestEmail.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const handleSave = useCallback(() => {
    if (!pickedId || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    startTransition(async () => {
      const result = await setMainContactAction(companyId, pickedId);
      setIsSaving(false);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }, [companyId, pickedId, isSaving, onClose, router]);

  const canSave = pickedId !== null;

  return (
    <CompanyActionModal
      open={open}
      onClose={onClose}
      title="Byt huvudkontakt"
      canSave={canSave}
      isSaving={isSaving}
      onSave={handleSave}
      errorMessage={errorMessage}
    >
      {/* Search — same visual shell as the guest picker in
          CompanyCreateForm (pf-collection-trigger + search icon). */}
      <div className="pf-collection-trigger" style={{ marginBottom: 0 }}>
        <EditorIcon
          name="search"
          size={18}
          style={{
            color: "var(--admin-text-tertiary)",
            flexShrink: 0,
          }}
        />
        <input
          ref={searchRef}
          type="text"
          className="pf-collection-trigger__input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök kunder"
          autoFocus
        />
      </div>

      {/* Candidate list — negative horizontal margin breaks out of the
          20px body padding so rows span edge-to-edge like the create-form
          picker. minHeight keeps the modal at a stable size when the list
          is short. maxHeight caps scroll on very long lists. */}
      <div
        role="listbox"
        aria-label="Välj ny huvudkontakt"
        style={{
          marginLeft: -20,
          marginRight: -20,
          marginTop: 12,
          marginBottom: -20,
          borderTop: "1px solid #EBEBEB",
          maxHeight: 340,
          minHeight: 220,
          overflowY: "auto",
        }}
      >
        {candidates.length === 0 ? (
          <p
            style={{
              padding: 20,
              textAlign: "center",
              fontSize: 13,
              color: "var(--admin-text-tertiary)",
              margin: 0,
            }}
          >
            {contacts.filter((c) => !c.isMainContact).length === 0
              ? "Det finns inga andra kontakter att välja mellan."
              : "Inga kunder matchar sökningen."}
          </p>
        ) : (
          candidates.map((item) => {
            const selected = pickedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => setPickedId(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 20px",
                  background: selected
                    ? "color-mix(in srgb, var(--admin-accent) 10%, transparent)"
                    : "transparent",
                  border: "none",
                  borderBottom: "1px solid #EBEBEB",
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
                {selected ? (
                  <EditorIcon
                    name="check"
                    size={18}
                    style={{ color: "var(--admin-accent)", flexShrink: 0 }}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </CompanyActionModal>
  );
}
