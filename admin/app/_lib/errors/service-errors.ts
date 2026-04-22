/**
 * Shared service-layer error classes.
 *
 * Every service error carries a machine-readable `code`, a human-readable
 * message (Swedish for user-facing scenarios where appropriate, English
 * otherwise), and an optional `context` bag for relevant IDs. Route handlers
 * map these to HTTP status codes and API responses.
 *
 * Callers can narrow either by `instanceof NotFoundError` or by inspecting
 * `error.code`. Both are stable. New codes may only be added here.
 */

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "UNAUTHORIZED";

export type ServiceErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>;

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly context?: ServiceErrorContext,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string, context?: ServiceErrorContext) {
    super("NOT_FOUND", message, context);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, context?: ServiceErrorContext) {
    super("CONFLICT", message, context);
    this.name = "ConflictError";
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, context?: ServiceErrorContext) {
    super("VALIDATION", message, context);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends ServiceError {
  constructor(message: string, context?: ServiceErrorContext) {
    super("UNAUTHORIZED", message, context);
    this.name = "UnauthorizedError";
  }
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError;
}
