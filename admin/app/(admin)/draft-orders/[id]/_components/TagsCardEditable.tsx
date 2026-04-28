"use client";

import { TagsCard as NewTagsCard } from "@/app/(admin)/draft-orders/new/_components/TagsCard";

interface TagsCardEditableProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Edit-mode tags card for /konfigurera. Currently a thin wrapper around
 * /new TagsCard — chip-input + autocomplete + dedup logic stays there.
 * Keeping a separate wrapper preserves naming symmetry with the other
 * Editable cards and gives us a seam for future divergence (e.g. if
 * edit-mode ever needs a different max-tag count).
 */
export function TagsCardEditable({ value, onChange }: TagsCardEditableProps) {
  return <NewTagsCard value={value} onChange={onChange} />;
}
