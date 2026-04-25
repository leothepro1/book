import type { DraftOrderStatus } from "@prisma/client";
import type { BadgeBucket } from "@/app/_lib/orders/badge";

export const DRAFT_LABELS: Record<DraftOrderStatus, string> = {
  OPEN: "Utkast",
  PENDING_APPROVAL: "Inväntar godkännande",
  APPROVED: "Godkänd",
  REJECTED: "Avvisad",
  INVOICED: "Fakturerad",
  PAID: "Betald",
  OVERDUE: "Förfallen",
  COMPLETING: "Genomförs",
  COMPLETED: "Genomförd",
  CANCELLED: "Avbruten",
};

export function getDraftBucket(status: DraftOrderStatus): BadgeBucket {
  switch (status) {
    case "OPEN":
    case "PENDING_APPROVAL":
    case "COMPLETING":
      return "PÅGÅENDE";
    case "APPROVED":
    case "INVOICED":
      return "VÄNTANDE";
    case "OVERDUE":
    case "REJECTED":
      return "PROBLEM";
    case "PAID":
    case "COMPLETED":
    case "CANCELLED":
      return "AVSLUTAD";
  }
}
