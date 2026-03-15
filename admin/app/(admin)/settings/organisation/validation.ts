import { z } from "zod";

export const BusinessTypeSchema = z.enum(["ab", "ef", "hb", "kb", "other"]);
export type BusinessType = z.infer<typeof BusinessTypeSchema>;

export const BusinessTypeLabels: Record<BusinessType, string> = {
  ab: "Aktiebolag (AB)",
  ef: "Enskild firma",
  hb: "Handelsbolag (HB)",
  kb: "Kommanditbolag (KB)",
  other: "Annat",
};

export const OrganisationFormSchema = z.object({
  legalName: z.string().max(200).optional(),
  businessType: BusinessTypeSchema.optional(),
  nickname: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  addressStreet: z.string().max(200).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCity: z.string().max(100).optional(),
  addressCountry: z.string().length(2).optional(),
  organizationNumber: z.string().max(20).optional(),
  vatNumber: z.string().max(20).optional(),
});

export type OrganisationFormData = z.infer<typeof OrganisationFormSchema>;
