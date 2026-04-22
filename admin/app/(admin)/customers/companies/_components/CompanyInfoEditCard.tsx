"use client";

import type { Company } from "@prisma/client";
import { EditableCard } from "./EditableCard";
import { ChipInput, TextAreaField, TextField } from "./form-primitives";
import { updateCompanyAction } from "../actions";

interface Draft {
  name: string;
  externalId: string;
  tags: string[];
  note: string;
}

export function CompanyInfoEditCard({ company }: { company: Company }) {
  const initial: Draft = {
    name: company.name,
    externalId: company.externalId ?? "",
    tags: Array.isArray(company.tags) ? [...company.tags] : [],
    note: company.note ?? "",
  };

  return (
    <EditableCard<Draft>
      title="Företagsuppgifter"
      initial={initial}
      onSave={async (d) =>
        updateCompanyAction(company.id, {
          name: d.name.trim(),
          externalId: d.externalId.trim() || null,
          tags: d.tags,
          note: d.note.trim() || null,
        })
      }
    >
      {({ draft, set, saving }) => (
        <>
          <TextField
            label="Namn"
            value={draft.name}
            onChange={(v) => set({ name: v })}
            required
            disabled={saving}
          />
          <TextField
            label="Externt ID"
            value={draft.externalId}
            onChange={(v) => set({ externalId: v })}
            help="Används för synk med ERP eller PMS."
            disabled={saving}
          />
          <ChipInput
            label="Taggar"
            value={draft.tags}
            onChange={(v) => set({ tags: v })}
          />
          <TextAreaField
            label="Anteckning"
            value={draft.note}
            onChange={(v) => set({ note: v })}
            rows={4}
            disabled={saving}
          />
        </>
      )}
    </EditableCard>
  );
}
