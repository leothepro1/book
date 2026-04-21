-- Backfill financialStatus and fulfillmentStatus from legacy status field.
-- Safe to run multiple times (idempotent).

UPDATE "Order" SET
  "financialStatus" = CASE status
    WHEN 'PENDING'   THEN 'PENDING'::"OrderFinancialStatus"
    WHEN 'PAID'      THEN 'PAID'::"OrderFinancialStatus"
    WHEN 'FULFILLED' THEN 'PAID'::"OrderFinancialStatus"
    WHEN 'CANCELLED' THEN 'VOIDED'::"OrderFinancialStatus"
    WHEN 'REFUNDED'  THEN 'REFUNDED'::"OrderFinancialStatus"
    ELSE 'PENDING'::"OrderFinancialStatus"
  END,
  "fulfillmentStatus" = CASE status
    WHEN 'PENDING'   THEN 'UNFULFILLED'::"OrderFulfillmentStatus"
    WHEN 'PAID'      THEN 'UNFULFILLED'::"OrderFulfillmentStatus"
    WHEN 'FULFILLED' THEN 'FULFILLED'::"OrderFulfillmentStatus"
    WHEN 'CANCELLED' THEN 'CANCELLED'::"OrderFulfillmentStatus"
    WHEN 'REFUNDED'  THEN 'FULFILLED'::"OrderFulfillmentStatus"
    ELSE 'UNFULFILLED'::"OrderFulfillmentStatus"
  END;
