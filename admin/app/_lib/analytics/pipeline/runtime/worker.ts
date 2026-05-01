/**
 * Phase 3 PR-B — Web Worker entry point for the analytics pixel.
 *
 * Executes inside a Web Worker context (no DOM, no document, no
 * window — `self` is `WorkerGlobalScope`). The worker's only job is to:
 *
 *   1. Receive `{type:'event', tenantId, eventName, payload, correlationId?}`
 *      from the main-thread bridge via postMessage.
 *   2. Verify tenant_id consistency: the first message's tenantId is
 *      locked into closure state; any subsequent message with a
 *      different tenantId is rejected with `tenant_id_mismatch`. The
 *      worker is the last-line defense against a hypothetical main-
 *      thread bug that misreads the hostname and would otherwise
 *      cross-tenant-leak data.
 *   3. Validate the payload against the storefront schema bundled in
 *      `worker-validate.ts`. Bad payload → `validation_failed`.
 *   4. Generate `event_id` (ULID) and `occurred_at` (ISO 8601 with
 *      offset). Build the dispatch envelope.
 *   5. postMessage `{type:'send', envelope, correlationId?}` back to
 *      main, which performs the actual fetch/sendBeacon.
 *
 * The worker NEVER copies tenantId into the outbound envelope — the
 * dispatch endpoint resolves tenant from the Host header, never from
 * the body (PR-A's tenancy-bypass guard).
 *
 * Testability: `createMessageHandler()` is a pure factory returning a
 * stateful function. Tests instantiate it directly and call it with
 * synthesized messages — no `self` mocking required. The
 * Worker-scope wiring at the bottom of this file is the only branch
 * that touches `self`, and it's behind a `typeof` guard so the module
 * imports cleanly in node.
 */

import { ulid } from "ulidx";

import {
  STOREFRONT_SCHEMA_VERSIONS,
  isStorefrontEventName,
  validatePayload,
} from "./worker-validate";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./worker-types";

/**
 * Creates a message handler with closed-over tenant-consistency state.
 * Each Worker instance gets one handler; tests get a fresh handler per
 * case so state doesn't leak between scenarios.
 */
export function createMessageHandler(): (
  msg: unknown,
) => WorkerOutboundMessage {
  let lockedTenantId: string | null = null;

  return (raw: unknown): WorkerOutboundMessage => {
    // Boundary check — anything that's not a recognized inbound shape
    // gets a clear `unknown_message` rather than crashing the worker.
    const msg = raw as Partial<WorkerInboundMessage> | null;
    if (!msg || typeof msg !== "object" || msg.type !== "event") {
      return {
        type: "error",
        code: "unknown_message",
        message: "worker received a message with an unrecognized type",
      };
    }

    const { tenantId, eventName, payload, correlationId } = msg;

    if (typeof tenantId !== "string" || tenantId.length === 0) {
      return {
        type: "error",
        code: "validation_failed",
        message: "tenantId must be a non-empty string",
        correlationId,
      };
    }

    // Refinement #2: tenant lock. First call wins; mismatch is fatal.
    if (lockedTenantId === null) {
      lockedTenantId = tenantId;
    } else if (lockedTenantId !== tenantId) {
      return {
        type: "error",
        code: "tenant_id_mismatch",
        message: `worker is locked to tenant '${lockedTenantId}'; received '${tenantId}'`,
        details: { expected: lockedTenantId, actual: tenantId },
        correlationId,
      };
    }

    if (typeof eventName !== "string" || !isStorefrontEventName(eventName)) {
      return {
        type: "error",
        code: "unknown_event",
        message: `event '${String(eventName)}' is not a storefront event`,
        correlationId,
      };
    }

    if (!payload || typeof payload !== "object") {
      return {
        type: "error",
        code: "validation_failed",
        message: "payload must be an object",
        correlationId,
      };
    }

    const validation = validatePayload(eventName, payload);
    if (!validation.ok) {
      return {
        type: "error",
        code: "validation_failed",
        message: `payload failed schema validation for ${eventName}`,
        details: { issues: validation.issues },
        correlationId,
      };
    }

    return {
      type: "send",
      envelope: {
        event_id: ulid(),
        event_name: eventName,
        schema_version: STOREFRONT_SCHEMA_VERSIONS[eventName],
        occurred_at: new Date().toISOString(),
        payload: payload as Record<string, unknown>,
        ...(correlationId ? { correlation_id: correlationId } : {}),
      },
      correlationId,
    };
  };
}

// ── Worker-scope wiring ──────────────────────────────────────────────────
//
// In a real Web Worker, `self` is `DedicatedWorkerGlobalScope`. Under
// node test contexts `self` is undefined, so the import is side-effect-
// free for unit tests. We branch on `typeof self` rather than reading
// any Worker-specific globals so the module compiles cleanly under
// tsc with the standard `lib: ["es2020", "dom"]` config.

declare const self: {
  addEventListener?: (
    type: "message",
    listener: (e: { data: unknown }) => void,
  ) => void;
  postMessage?: (msg: unknown) => void;
} & Record<string, unknown>;

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  const handler = createMessageHandler();
  self.addEventListener("message", (e) => {
    const result = handler(e.data);
    if (typeof self.postMessage === "function") {
      self.postMessage(result);
    }
  });
}
