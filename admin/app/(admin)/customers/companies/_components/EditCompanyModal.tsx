"use client";

/**
 * EditCompanyModal — "Redigera företagsuppgifter" modal opened from the
 * CompanyMetaCard overflow menu. Intentionally minimal: the three
 * identity fields that live on the company header itself — Name,
 * Externt ID, and Organisationsnummer.
 *
 * Other attributes have dedicated sidebar cards on the detail page:
 *   • Faktureringsadress   → BillingAddressEditCard (main column)
 *   • Betalningsvillkor,
 *     Skatt               → BillingSettingsCard (sidebar)
 *   • Taggar               → CompanyTagsCard (sidebar)
 *   • Anteckning           → CompanyNoteCard (sidebar)
 *
 * Writes are atomic via updateCompanyProfileAction: Name + Externt ID
 * patch the Company row, Organisationsnummer patches the first
 * CompanyLocation's taxId, and both updates run in one `$transaction`
 * so a failure on either side rolls back the whole edit. Spara only
 * activates when at least one field diverges from the initial value,
 * and the patch sent to the server strips out no-op fields to keep
 * the COMPANY_UPDATED audit event tight.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCompanyProfileAction } from "../actions";
import { CompanyActionModal } from "./CompanyActionModal";

export interface EditCompanyInitial {
  name: string;
  externalId: string;
  taxId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: string;
  initial: EditCompanyInitial;
}

export function EditCompanyModal({
  open,
  onClose,
  companyId,
  initial,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [externalId, setExternalId] = useState(initial.externalId);
  const [taxId, setTaxId] = useState(initial.taxId);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset on every (re-)open so a stale value from a previous session
  // can never leak back into the form.
  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setExternalId(initial.externalId);
    setTaxId(initial.taxId);
    setErrorMessage(null);
    setIsSaving(false);
  }, [open, initial]);

  // Trim before compare so trailing whitespace doesn't look like a real
  // change. Spara stays disabled until any field actually differs.
  const dirty = useMemo(
    () =>
      name.trim() !== initial.name.trim() ||
      externalId.trim() !== initial.externalId.trim() ||
      taxId.trim() !== initial.taxId.trim(),
    [name, externalId, taxId, initial],
  );

  const handleSave = useCallback(() => {
    if (isSaving) return;
    if (!name.trim()) {
      setErrorMessage("Företagsnamn krävs");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const companyPatch: {
      name?: string;
      externalId?: string | null;
    } = {};
    if (name.trim() !== initial.name.trim()) companyPatch.name = name.trim();
    if (externalId.trim() !== initial.externalId.trim()) {
      companyPatch.externalId = externalId.trim() || null;
    }

    const firstLocation =
      taxId.trim() !== initial.taxId.trim()
        ? { taxId: taxId.trim() || null }
        : undefined;

    startTransition(async () => {
      const result = await updateCompanyProfileAction({
        companyId,
        company: companyPatch,
        firstLocation,
      });
      setIsSaving(false);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }, [isSaving, companyId, name, externalId, taxId, initial, onClose, router]);

  return (
    <CompanyActionModal
      open={open}
      onClose={onClose}
      title="Redigera företagsuppgifter"
      canSave={dirty}
      isSaving={isSaving}
      onSave={handleSave}
      errorMessage={errorMessage}
    >
      <div className="pf-field">
        <label className="admin-label">Företagsnamn</label>
        <input
          type="text"
          className="email-sender__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isSaving}
        />
      </div>

      <div className="pf-field">
        <label className="admin-label">Externt ID</label>
        <input
          type="text"
          className="email-sender__input"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="Används för synk med ERP eller PMS"
          disabled={isSaving}
        />
      </div>

      <div className="pf-field" style={{ marginBottom: 0 }}>
        <label className="admin-label">Organisationsnummer</label>
        <input
          type="text"
          className="email-sender__input"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          placeholder="T.ex. SE556677889901"
          disabled={isSaving}
        />
      </div>
    </CompanyActionModal>
  );
}
