/**
 * Append-only CancellationEvent writer.
 *
 * Every state transition, every PMS call, every refund call, every
 * email attempt is recorded here. Rows are NEVER updated — a correction
 * is a new row, not a rewrite. Parallels OrderEvent pattern.
 *
 * Accepts either a Prisma client or a transaction client so engines
 * running inside a $transaction can emit events atomically with the
 * status mutation they describe.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CancellationEventType,
  CancellationInitiator,
  CancellationEventMetadata,
} from "./types";

type EventWriter = PrismaClient | Prisma.TransactionClient;

export async function emitCancellationEvent(
  db: EventWriter,
  params: {
    cancellationRequestId: string;
    tenantId: string;
    type: CancellationEventType;
    actor: CancellationInitiator;
    actorUserId?: string | null;
    message?: string | null;
    metadata?: CancellationEventMetadata;
  },
): Promise<void> {
  await db.cancellationEvent.create({
    data: {
      cancellationRequestId: params.cancellationRequestId,
      tenantId: params.tenantId,
      type: params.type,
      actor: params.actor,
      actorUserId: params.actorUserId ?? null,
      message: params.message ?? null,
      metadata:
        params.metadata && Object.keys(params.metadata).length > 0
          ? (params.metadata as Prisma.InputJsonValue)
          : undefined,
    },
  });
}
