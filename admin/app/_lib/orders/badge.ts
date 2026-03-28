import type { OrderFinancialStatus, OrderFulfillmentStatus } from "@prisma/client";

export type BadgeBucket = "AVSLUTAD" | "VÄNTANDE" | "PÅGÅENDE" | "PROBLEM";

export const BUCKET_STYLES: Record<BadgeBucket, { background: string; color: string }> = {
  AVSLUTAD: { background: "#E8E8E8", color: "#616161" },
  VÄNTANDE: { background: "#FFD6A4", color: "#5E4200" },
  PÅGÅENDE: { background: "#FFEB78", color: "#4F4700" },
  PROBLEM:  { background: "#FED1D7", color: "#8E0B21" },
};

export const FINANCIAL_LABELS: Record<OrderFinancialStatus, string> = {
  PENDING: "Väntande",
  AUTHORIZED: "Auktoriserad",
  PAID: "Betald",
  PARTIALLY_REFUNDED: "Delvis återbetald",
  REFUNDED: "Återbetald",
  VOIDED: "Annullerad",
};

export const FULFILLMENT_LABELS: Record<OrderFulfillmentStatus, string> = {
  UNFULFILLED: "Kommande",
  SCHEDULED: "Schemalagd",
  IN_PROGRESS: "Pågående",
  FULFILLED: "Genomförd",
  ON_HOLD: "Pausad",
  CANCELLED: "Avbokad",
};

export function getFinancialBucket(
  financial: OrderFinancialStatus,
  fulfillment: OrderFulfillmentStatus,
): BadgeBucket {
  switch (financial) {
    case "PENDING":            return "VÄNTANDE";
    case "AUTHORIZED":         return "VÄNTANDE";
    case "PARTIALLY_REFUNDED": return "PROBLEM";
    case "REFUNDED":           return "AVSLUTAD";
    case "VOIDED":             return "AVSLUTAD";
    case "PAID": {
      switch (fulfillment) {
        case "UNFULFILLED":  return "PÅGÅENDE";
        case "SCHEDULED":    return "PÅGÅENDE";
        case "IN_PROGRESS":  return "PÅGÅENDE";
        case "ON_HOLD":      return "VÄNTANDE";
        case "FULFILLED":    return "AVSLUTAD";
        case "CANCELLED":    return "AVSLUTAD";
        default: {
          const _exhaustive: never = fulfillment;
          throw new Error(`Unknown fulfillment status: ${_exhaustive}`);
        }
      }
    }
    default: {
      const _exhaustive: never = financial;
      throw new Error(`Unknown financial status: ${_exhaustive}`);
    }
  }
}

export function getFulfillmentBucket(
  fulfillment: OrderFulfillmentStatus,
): BadgeBucket {
  switch (fulfillment) {
    case "UNFULFILLED":  return "PÅGÅENDE";
    case "SCHEDULED":    return "PÅGÅENDE";
    case "IN_PROGRESS":  return "PÅGÅENDE";
    case "FULFILLED":    return "AVSLUTAD";
    case "ON_HOLD":      return "VÄNTANDE";
    case "CANCELLED":    return "AVSLUTAD";
    default: {
      const _exhaustive: never = fulfillment;
      throw new Error(`Unknown fulfillment status: ${_exhaustive}`);
    }
  }
}
