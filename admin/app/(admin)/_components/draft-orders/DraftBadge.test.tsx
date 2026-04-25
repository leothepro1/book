// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DraftOrderStatus } from "@prisma/client";

import { DraftBadge } from "./DraftBadge";
import { DRAFT_LABELS, getDraftBucket } from "@/app/_lib/draft-orders/badge";
import { BUCKET_STYLES } from "@/app/_lib/orders/badge";

const ALL_STATUSES: DraftOrderStatus[] = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "INVOICED",
  "PAID",
  "OVERDUE",
  "COMPLETING",
  "COMPLETED",
  "CANCELLED",
];

describe("DraftBadge — label rendering for every status", () => {
  for (const status of ALL_STATUSES) {
    it(`B-${status} — renders Swedish label "${DRAFT_LABELS[status]}"`, () => {
      const { container } = render(<DraftBadge status={status} />);
      expect(container.textContent).toBe(DRAFT_LABELS[status]);
    });
  }
});

describe("DraftBadge — bucket assignment correctness", () => {
  it("BB1 — OPEN → PÅGÅENDE", () => {
    expect(getDraftBucket("OPEN")).toBe("PÅGÅENDE");
  });

  it("BB2 — APPROVED → VÄNTANDE", () => {
    expect(getDraftBucket("APPROVED")).toBe("VÄNTANDE");
  });

  it("BB3 — OVERDUE → PROBLEM", () => {
    expect(getDraftBucket("OVERDUE")).toBe("PROBLEM");
  });

  it("BB4 — PAID → AVSLUTAD", () => {
    expect(getDraftBucket("PAID")).toBe("AVSLUTAD");
  });
});

describe("DraftBadge — applies BUCKET_STYLES to span", () => {
  it("BS — VÄNTANDE bucket applies its background color to the span", () => {
    render(<DraftBadge status="APPROVED" />);
    const span = screen.getByText(DRAFT_LABELS.APPROVED);
    // jsdom normalizes hex → rgb; convert the expected hex for the comparison.
    const hex = BUCKET_STYLES.VÄNTANDE.background.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect(span.style.background).toBe(`rgb(${r}, ${g}, ${b})`);
  });
});
