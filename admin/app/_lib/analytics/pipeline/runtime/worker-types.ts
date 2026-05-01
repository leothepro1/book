/**
 * Phase 3 PR-B — Worker message contracts (typed).
 *
 * The worker is a strict postMessage boundary. Every message in either
 * direction is one of the discriminated unions below. Drift between the
 * main-thread bridge and the worker is caught at compile time by these
 * types; runtime messages that don't match either union are mapped to
 * `{type:'error', code:'unknown_message'}` and dropped.
 *
 * The worker NEVER receives or emits a `tenant_id` field on the wire —
 * the dispatch endpoint resolves tenant from the Host header. The
 * `tenantId` field on `WorkerInboundEventMessage` exists ONLY for
 * worker-internal consistency checks (refinement #2): once the worker
 * sees a tenantId on its first event message, any subsequent message
 * with a different tenantId is rejected with `tenant_id_mismatch`. That
 * value is never copied into the outbound envelope.
 */

export const STOREFRONT_EVENT_NAMES = [
  "page_viewed",
  "accommodation_viewed",
  "availability_searched",
  "cart_started",
  "cart_updated",
  "cart_abandoned",
  "checkout_started",
] as const;

export type StorefrontEventName = (typeof STOREFRONT_EVENT_NAMES)[number];

/** Inbound: main thread → worker. */
export type WorkerInboundMessage = WorkerInboundEventMessage;

export interface WorkerInboundEventMessage {
  type: "event";
  /**
   * Tenant identifier the main thread believes this worker is serving.
   * Worker locks to the first value seen and rejects mismatches.
   * Never copied to the outbound envelope.
   */
  tenantId: string;
  eventName: StorefrontEventName;
  /**
   * Full event payload INCLUDING the storefront-context fields
   * (page_url, page_referrer, user_agent_hash, viewport, locale,
   * session_id). The main thread builds this — the worker has no DOM
   * access and cannot compose context itself.
   */
  payload: Record<string, unknown>;
  /** Optional correlation id (≤64 chars), echoed back on the outbound. */
  correlationId?: string;
}

/** Outbound: worker → main thread. */
export type WorkerOutboundMessage =
  | WorkerOutboundSendMessage
  | WorkerOutboundErrorMessage;

export interface WorkerOutboundSendMessage {
  type: "send";
  envelope: RequestEnvelope;
  /** Echo of the inbound correlationId, if any. */
  correlationId?: string;
}

export interface WorkerOutboundErrorMessage {
  type: "error";
  code: WorkerErrorCode;
  message: string;
  /** Free-form structured detail (e.g. Zod issue list). */
  details?: Record<string, unknown>;
  /** Echo of the inbound correlationId, if any. */
  correlationId?: string;
}

export type WorkerErrorCode =
  | "validation_failed"
  | "unknown_event"
  | "tenant_id_mismatch"
  | "unknown_message"
  | "internal";

/**
 * Outbound envelope — exactly the shape the dispatch endpoint
 * (`/api/analytics/collect`) expects, mirroring PR-A's
 * RequestEnvelopeSchema. The main thread serializes this and POSTs it.
 */
export interface RequestEnvelope {
  event_id: string;
  event_name: StorefrontEventName;
  schema_version: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  correlation_id?: string;
}
