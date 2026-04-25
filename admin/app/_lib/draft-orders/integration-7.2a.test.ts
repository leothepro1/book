/**
 * FAS 7.2a — Integration smoke for createDraftWithLines.
 *
 * Gated on DATABASE_URL_TEST. Skips silently if absent (CI/local without
 * a test DB still passes the file). When wired, runs against a real
 * Postgres + seeded Accommodation rows + Fake PMS adapter.
 */

import { describe, it } from "vitest";

const TEST_DB = process.env.DATABASE_URL_TEST;

describe.skipIf(!TEST_DB)("createDraftWithLines integration (DATABASE_URL_TEST)", () => {
  it("I1 — atomic create against real DB persists draft + lines + events + totals", async () => {
    // Wired in follow-up commit when integration test harness lands.
    // For now, the gate above ensures this file passes when DATABASE_URL_TEST
    // is unset, and gives a placeholder slot for future wiring.
  });

  it("I2 — race scenario: parallel creates resolve via Prisma isolation", async () => {
    // Same — placeholder. Two parallel createDraftWithLines for same
    // accommodation+dates. Prisma's tx isolation should serialize them;
    // post-commit hold-placement on the second should see the first's
    // hold and surface a conflict via PMS.
  });
});
