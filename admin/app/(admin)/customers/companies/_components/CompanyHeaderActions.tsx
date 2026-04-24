"use client";

/**
 * CompanyHeaderActions — exact mirror of the customer detail page's
 * header-actions cluster:
 *
 *   "Fler åtgärder" dropdown (Skicka e-post + Inaktivera företag)
 *   + prev/next navigation buttons.
 *
 * Class names (`ord-header-actions*`) and icon choices (expand_more,
 * mail, block, expand_less, expand_more) are identical to
 * CustomerDetailClient — only the labels, aria-labels and the nav
 * targets change. Both dropdown items are intentionally non-functional
 * stubs, matching the customer equivalent.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";

interface Props {
  companyId: string;
  prevCompanyId: string | null;
  nextCompanyId: string | null;
}

export function CompanyHeaderActions({
  companyId: _companyId,
  prevCompanyId,
  nextCompanyId,
}: Props) {
  const router = useRouter();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click — same pattern as
  // CustomerDetailClient.
  useEffect(() => {
    if (!actionsOpen) return;
    const handle = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [actionsOpen]);

  return (
    <div className="ord-header-actions">
      {/* Fler åtgärder */}
      <div className="ord-header-actions__more" ref={actionsRef}>
        <button
          type="button"
          className="ord-header-actions__btn"
          onClick={() => setActionsOpen((v) => !v)}
        >
          Fler åtgärder
          <EditorIcon name="expand_more" size={18} />
        </button>
        {actionsOpen && (
          <div className="ord-header-actions__dropdown">
            <button
              type="button"
              className="ord-header-actions__dropdown-item"
            >
              <EditorIcon name="mail" size={16} />
              Skicka e-post
            </button>
            <button
              type="button"
              className="ord-header-actions__dropdown-item ord-header-actions__dropdown-item--danger"
              onClick={() => setActionsOpen(false)}
            >
              <EditorIcon name="block" size={16} />
              Inaktivera företag
            </button>
          </div>
        )}
      </div>
      {/* Prev / Next */}
      <button
        type="button"
        className="ord-header-actions__nav"
        disabled={!prevCompanyId}
        onClick={() =>
          prevCompanyId && router.push(`/customers/companies/${prevCompanyId}`)
        }
        aria-label="Föregående företag"
      >
        <EditorIcon name="expand_less" size={18} />
      </button>
      <button
        type="button"
        className="ord-header-actions__nav"
        disabled={!nextCompanyId}
        onClick={() =>
          nextCompanyId && router.push(`/customers/companies/${nextCompanyId}`)
        }
        aria-label="Nästa företag"
      >
        <EditorIcon name="expand_more" size={18} />
      </button>
    </div>
  );
}
