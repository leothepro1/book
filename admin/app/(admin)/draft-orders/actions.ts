"use server";

import type { DraftOrderStatus } from "@prisma/client";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import {
  listDrafts,
  type DraftListFilters,
  type DraftListSort,
  type DraftListItem,
} from "@/app/_lib/draft-orders";
import {
  freezePrices,
  sendInvoice,
  cancelDraft,
} from "@/app/_lib/draft-orders/lifecycle";
import { resendInvoice } from "@/app/_lib/draft-orders/resend-invoice";
import { runWithPool } from "@/app/_lib/concurrency/pool";
import { log } from "@/app/_lib/logger";
import {
  ConflictError,
  ValidationError,
} from "@/app/_lib/errors/service-errors";

// ── Types ──────────────────────────────────────────────────────

export type DraftTab = "alla" | "öppna" | "fakturerade" | "betalda" | "stängda";

export type GetDraftsParams = {
  tab?: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: DraftListSort["by"];
  sortDirection?: DraftListSort["direction"];
};

export type GetDraftsResult = {
  items: DraftListItem[];
  total: number;
  page: number;
  limit: number;
};

const DEFAULT_LIMIT = 25;

// ── Tab → status filter ────────────────────────────────────────

function buildTabFilters(tab?: string): DraftListFilters {
  switch (tab) {
    case "öppna":
      return { status: ["OPEN", "PENDING_APPROVAL", "APPROVED"] };
    case "fakturerade":
      return { status: ["INVOICED", "OVERDUE"] };
    case "betalda":
      return { status: ["PAID"] };
    case "stängda":
      return { status: ["COMPLETED", "CANCELLED", "REJECTED"] };
    case "alla":
    default:
      return {};
  }
}

// ── Server action ──────────────────────────────────────────────

export async function getDrafts(
  params: GetDraftsParams,
): Promise<GetDraftsResult> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const page = params.page ?? 1;

  const { orgId } = await getAuth();
  if (!orgId) return { items: [], total: 0, page, limit };

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return { items: [], total: 0, page, limit };

  const filters = buildTabFilters(params.tab);
  if (params.search && params.search.length > 0) {
    filters.search = params.search;
  }

  const sort: DraftListSort = {
    by: params.sortBy ?? "expiresAt",
    direction: params.sortDirection ?? "asc",
  };

  const result = await listDrafts(tenant.id, {
    filters,
    sort,
    page,
    limit,
  });

  return {
    items: result.items,
    total: result.totalCount,
    page: result.page,
    limit: result.limit,
  };
}

// ═══════════════════════════════════════════════════════════════
// FAS 7.8 — Bulk actions on /draft-orders index
// ═══════════════════════════════════════════════════════════════

/**
 * Per-row outcome bucketed result returned to the BulkResultModal.
 *
 * `succeeded` — service call returned ok.
 * `skipped`   — pre-condition or race-on-terminal (status moved or required
 *               field missing). ValidationError + ConflictError land here —
 *               same classification sweepExpiredDrafts uses (expire.ts:96).
 * `failed`    — anything else (genuine runtime error).
 *
 * `displayNumber` is included on every outcome so the modal can render
 * human-readable rows without an extra round-trip to the DB.
 */
export type BulkActionOutcome = {
  draftId: string;
  displayNumber: string;
};

export type BulkActionResult =
  | {
      ok: true;
      total: number;
      succeeded: BulkActionOutcome[];
      failed: (BulkActionOutcome & { error: string })[];
      skipped: (BulkActionOutcome & { reason: string })[];
    }
  | { ok: false; error: string };

const BULK_POOL_CONCURRENCY = 4;

/** Bulk concurrency = 4 keeps Stripe + DB burst within comfortable headroom
 *  per recon Q3. See _audit/7-8-recon.md §D for the rate-limit math. */

const EMPTY_BULK_RESULT: Extract<BulkActionResult, { ok: true }> = {
  ok: true,
  total: 0,
  succeeded: [],
  failed: [],
  skipped: [],
};

type BulkRow = { id: string; displayNumber: string; status: DraftOrderStatus };

type PerRowOutcome =
  | { kind: "ok"; outcome: BulkActionOutcome }
  | { kind: "skip"; outcome: BulkActionOutcome & { reason: string } }
  | { kind: "fail"; outcome: BulkActionOutcome & { error: string } };

/**
 * Resolve unique input ids → rows the caller is allowed to act on.
 * Drafts outside `actor.tenantId` are silently absent — the result shape
 * never confirms the existence of a non-tenant id, so no enumeration leak.
 */
async function loadBulkRows(
  tenantId: string,
  draftIds: readonly string[],
): Promise<BulkRow[]> {
  if (draftIds.length === 0) return [];
  const unique = Array.from(new Set(draftIds));
  return (await prisma.draftOrder.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, displayNumber: true, status: true },
  })) as BulkRow[];
}

function classifyServiceError(
  err: unknown,
  row: BulkRow,
): PerRowOutcome {
  const base = { draftId: row.id, displayNumber: row.displayNumber };
  if (err instanceof ValidationError || err instanceof ConflictError) {
    return { kind: "skip", outcome: { ...base, reason: err.message } };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "fail", outcome: { ...base, error: message } };
}

function aggregate(
  total: number,
  outcomes: PerRowOutcome[],
): Extract<BulkActionResult, { ok: true }> {
  const result: Extract<BulkActionResult, { ok: true }> = {
    ok: true,
    total,
    succeeded: [],
    failed: [],
    skipped: [],
  };
  for (const o of outcomes) {
    if (o.kind === "ok") result.succeeded.push(o.outcome);
    else if (o.kind === "skip") result.skipped.push(o.outcome);
    else result.failed.push(o.outcome);
  }
  return result;
}

// ── Pre-condition gates (per-row, before service call) ──────────

const TERMINAL_FOR_CANCEL: ReadonlySet<DraftOrderStatus> = new Set([
  "CANCELLED",
  "COMPLETED",
  "REJECTED",
]);
const SEND_ALLOWED: ReadonlySet<DraftOrderStatus> = new Set([
  "OPEN",
  "APPROVED",
]);
const RESEND_ALLOWED: ReadonlySet<DraftOrderStatus> = new Set([
  "INVOICED",
  "OVERDUE",
]);

// ── bulkCancelDraftsAction ──────────────────────────────────────

export async function bulkCancelDraftsAction(input: {
  draftIds: string[];
  reason?: string;
}): Promise<BulkActionResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };
  if (input.draftIds.length === 0) return EMPTY_BULK_RESULT;

  const rows = await loadBulkRows(actor.tenantId, input.draftIds);
  const tenantId = actor.tenantId;
  const userId = actor.userId;
  const reason = input.reason?.trim() || undefined;

  const poolResults = await runWithPool(
    rows,
    async (row): Promise<PerRowOutcome> => {
      const base = { draftId: row.id, displayNumber: row.displayNumber };

      if (TERMINAL_FOR_CANCEL.has(row.status)) {
        return {
          kind: "skip",
          outcome: { ...base, reason: `Status ${row.status} kan inte avbrytas` },
        };
      }
      if (row.status === "PAID" && !reason) {
        return {
          kind: "skip",
          outcome: { ...base, reason: "Betald order kräver anledning" },
        };
      }

      try {
        await cancelDraft({
          tenantId,
          draftOrderId: row.id,
          reason,
          actorUserId: userId,
        });
        return { kind: "ok", outcome: base };
      } catch (err) {
        return classifyServiceError(err, row);
      }
    },
    { concurrency: BULK_POOL_CONCURRENCY },
  );

  const outcomes: PerRowOutcome[] = poolResults.map((r, i) => {
    if (r.ok && r.value) return r.value;
    // pool itself caught — defensive, the worker never throws.
    const row = rows[i];
    log("warn", "draft.bulk_cancel.pool_error", {
      tenantId,
      draftOrderId: row.id,
      error: r.error?.message,
    });
    return {
      kind: "fail",
      outcome: {
        draftId: row.id,
        displayNumber: row.displayNumber,
        error: r.error?.message ?? "unknown",
      },
    };
  });

  return aggregate(input.draftIds.length, outcomes);
}

// ── bulkSendInvoiceAction ───────────────────────────────────────

export async function bulkSendInvoiceAction(input: {
  draftIds: string[];
}): Promise<BulkActionResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };
  if (input.draftIds.length === 0) return EMPTY_BULK_RESULT;

  const rows = await loadBulkRows(actor.tenantId, input.draftIds);
  const tenantId = actor.tenantId;
  const userId = actor.userId;

  const poolResults = await runWithPool(
    rows,
    async (row): Promise<PerRowOutcome> => {
      const base = { draftId: row.id, displayNumber: row.displayNumber };

      if (!SEND_ALLOWED.has(row.status)) {
        return {
          kind: "skip",
          outcome: {
            ...base,
            reason: `Status ${row.status} kan inte faktureras`,
          },
        };
      }

      try {
        // Match sendDraftInvoiceAction: pre-fetch pricesFrozenAt to decide
        // whether to call freezePrices first (sendInvoice requires it).
        const draftBefore = await prisma.draftOrder.findFirst({
          where: { id: row.id, tenantId },
          select: { pricesFrozenAt: true },
        });
        if (!draftBefore) {
          return {
            kind: "skip",
            outcome: { ...base, reason: "Utkastet hittas inte" },
          };
        }
        if (draftBefore.pricesFrozenAt === null) {
          await freezePrices({
            tenantId,
            draftOrderId: row.id,
            actorUserId: userId,
          });
        }
        await sendInvoice({
          tenantId,
          draftOrderId: row.id,
          actorUserId: userId,
        });
        // Email send is intentionally NOT triggered here. sendInvoice
        // emits the platform-grade INVOICE_SENT side effects; bulk
        // send-invoice for V1 leaves email to operator-driven resend
        // when needed (matches recon §B.1 best-effort wording without
        // expanding cross-cutting email retries to the bulk path).
        return { kind: "ok", outcome: base };
      } catch (err) {
        return classifyServiceError(err, row);
      }
    },
    { concurrency: BULK_POOL_CONCURRENCY },
  );

  const outcomes: PerRowOutcome[] = poolResults.map((r, i) => {
    if (r.ok && r.value) return r.value;
    const row = rows[i];
    log("warn", "draft.bulk_send_invoice.pool_error", {
      tenantId,
      draftOrderId: row.id,
      error: r.error?.message,
    });
    return {
      kind: "fail",
      outcome: {
        draftId: row.id,
        displayNumber: row.displayNumber,
        error: r.error?.message ?? "unknown",
      },
    };
  });

  return aggregate(input.draftIds.length, outcomes);
}

// ── bulkResendInvoiceAction ─────────────────────────────────────

export async function bulkResendInvoiceAction(input: {
  draftIds: string[];
}): Promise<BulkActionResult> {
  const actor = await getActor();
  if (!actor.tenantId) return { ok: false, error: NO_TENANT_ERROR };
  if (input.draftIds.length === 0) return EMPTY_BULK_RESULT;

  const rows = await loadBulkRows(actor.tenantId, input.draftIds);
  const tenantId = actor.tenantId;
  const userId = actor.userId;

  const poolResults = await runWithPool(
    rows,
    async (row): Promise<PerRowOutcome> => {
      const base = { draftId: row.id, displayNumber: row.displayNumber };

      if (!RESEND_ALLOWED.has(row.status)) {
        return {
          kind: "skip",
          outcome: {
            ...base,
            reason: `Status ${row.status} kan inte skickas om`,
          },
        };
      }

      try {
        await resendInvoice({
          tenantId,
          draftOrderId: row.id,
          actorUserId: userId,
        });
        return { kind: "ok", outcome: base };
      } catch (err) {
        return classifyServiceError(err, row);
      }
    },
    { concurrency: BULK_POOL_CONCURRENCY },
  );

  const outcomes: PerRowOutcome[] = poolResults.map((r, i) => {
    if (r.ok && r.value) return r.value;
    const row = rows[i];
    log("warn", "draft.bulk_resend_invoice.pool_error", {
      tenantId,
      draftOrderId: row.id,
      error: r.error?.message,
    });
    return {
      kind: "fail",
      outcome: {
        draftId: row.id,
        displayNumber: row.displayNumber,
        error: r.error?.message ?? "unknown",
      },
    };
  });

  return aggregate(input.draftIds.length, outcomes);
}

// ── Internal helpers (also re-used by the index getDrafts) ─────

async function getActor(): Promise<{
  tenantId: string | null;
  userId?: string;
}> {
  const { orgId, userId } = await getAuth();
  if (!orgId) return { tenantId: null };
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  return {
    tenantId: tenant?.id ?? null,
    userId: userId ?? undefined,
  };
}

const NO_TENANT_ERROR = "Ingen tenant";
