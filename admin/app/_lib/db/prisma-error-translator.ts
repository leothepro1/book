/**
 * Prisma → ServiceError translator.
 *
 * Converts a narrow set of known Prisma errors to our shared service errors
 * so callers only ever deal with ServiceError subclasses. Applied selectively
 * via `withTranslatedErrors(fn)` around the specific DB writes where races
 * can legitimately produce unique-violation / FK-violation / missing-row
 * errors despite sensible pre-checks.
 *
 * Mapping is intentionally narrow. Anything we do not explicitly recognise
 * returns `null` and the caller rethrows, so unexpected Prisma errors still
 * propagate to observability (Sentry + logs) untouched.
 */

import { Prisma } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "../errors/service-errors";

/**
 * Translate a Prisma error to a ServiceError, or return null if unhandled.
 *
 * P2002: Unique constraint violation — another transaction won the race.
 * P2003: Foreign-key constraint violation — referenced row missing or scoped
 *        to a different tenant in a cross-table relation.
 * P2025: Operating on a record that does not exist — e.g. update/delete/
 *        connect against a row that was just removed.
 */
export function translatePrismaError(err: unknown): ServiceError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (err.code) {
    case "P2002": {
      const meta = (err.meta ?? {}) as { target?: unknown; modelName?: unknown };
      return new ConflictError("Unique constraint violation", {
        prismaCode: "UNIQUE_VIOLATION",
        target: Array.isArray(meta.target)
          ? meta.target.join(",")
          : typeof meta.target === "string"
            ? meta.target
            : null,
        modelName:
          typeof meta.modelName === "string" ? meta.modelName : undefined,
      });
    }
    case "P2003": {
      const meta = (err.meta ?? {}) as {
        field_name?: unknown;
        modelName?: unknown;
      };
      return new ValidationError("Foreign key constraint violation", {
        prismaCode: "FK_VIOLATION",
        field:
          typeof meta.field_name === "string" ? meta.field_name : undefined,
        modelName:
          typeof meta.modelName === "string" ? meta.modelName : undefined,
      });
    }
    case "P2025": {
      const meta = (err.meta ?? {}) as { cause?: unknown; modelName?: unknown };
      return new NotFoundError("Record not found", {
        prismaCode: "RECORD_NOT_FOUND",
        cause: typeof meta.cause === "string" ? meta.cause : undefined,
        modelName:
          typeof meta.modelName === "string" ? meta.modelName : undefined,
      });
    }
    default:
      return null;
  }
}

/**
 * Run `fn` and re-throw any Prisma error as a translated ServiceError. If the
 * caught error is neither a recognized Prisma error nor a plain Error, it is
 * rethrown untouched so surrounding code / Sentry / tests see the original.
 */
export async function withTranslatedErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const translated = translatePrismaError(err);
    if (translated) throw translated;
    throw err;
  }
}

/**
 * Single-retry helper for "upsert" semantics in the face of a P2002 race.
 *
 * Pattern: the caller's `write` function does a `findFirst` followed by
 * either `update` (row exists) or `create` (row absent). Under concurrent
 * execution, two callers can both see no row, both attempt `create`, and
 * one hits a unique-index violation. The semantic of these callers is
 * "make it so" — not "fail if a row now exists" — so we catch P2002 once
 * and re-run the closure. On the second pass, `findFirst` will observe the
 * row the winning caller just wrote and take the update path.
 *
 * ONLY retries on `ConflictError` with `code === "UNIQUE_VIOLATION"`. Every
 * other error (ValidationError for FK violations, NotFoundError, plain
 * Errors, unknown Prisma codes) is propagated untouched. If the second
 * attempt also throws, the second error surfaces — no infinite loop.
 *
 * Apply to functions whose body IS a findFirst-then-create/update upsert.
 * Do NOT apply to pure-read functions, or to inserters where a unique
 * violation is a legitimate "already exists" signal the caller should see
 * (e.g. assignCatalogToLocation, which has its own explicit idempotency
 * check and turns a re-assign into a no-op without relying on retry).
 */
export async function upsertWithRaceRetry<T>(
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (err) {
    const translated = translatePrismaError(err);
    if (
      translated instanceof ConflictError &&
      translated.context?.prismaCode === "UNIQUE_VIOLATION"
    ) {
      // Race: another writer beat us to the insert. Retry once — the
      // findFirst at the top of `write` will now see the row and take
      // the update path. If the retry also throws, translate + surface
      // the second error (still no infinite loop — we retry at most once).
      return await withTranslatedErrors(write);
    }
    // Non-race errors (including translated non-P2002 errors) propagate.
    if (translated) throw translated;
    throw err;
  }
}
