"use client";

import type { DraftOrderStatus } from "@prisma/client";
import { BUCKET_STYLES } from "@/app/_lib/orders/badge";
import { DRAFT_LABELS, getDraftBucket } from "@/app/_lib/draft-orders/badge";

type DraftBadgeProps = { status: DraftOrderStatus };

export function DraftBadge({ status }: DraftBadgeProps) {
  const bucket = getDraftBucket(status);
  const label = DRAFT_LABELS[status];
  const style = BUCKET_STYLES[bucket];

  return (
    <span
      style={{
        background: style.background,
        color: style.color,
        borderRadius: 8,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}
