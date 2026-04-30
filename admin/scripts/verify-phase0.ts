/**
 * Phase 0 verification script — analytics pipeline foundation.
 *
 *   $ ANALYTICS_PIPELINE_DEV_GUARD=1 tsx scripts/verify-phase0.ts
 *
 * Runs 15 checks (13 from spec 0.7 + multiSchema fence + dev-guard) against
 * the database the current DATABASE_URL points at. Prints ✓/✗ per check
 * with a short reason, exits 0 only if all pass.
 *
 * The dev guard is forced ON by the env-var assignment below so the test is
 * meaningful even when NODE_ENV is unset. Production NODE_ENV hard-disables
 * the guard regardless — see app/_lib/db/prisma.ts.
 */

// Force guard on BEFORE any dynamic import of app modules. Static imports of
// app modules are not allowed in this file because they would load before
// this assignment runs.
process.env.ANALYTICS_PIPELINE_DEV_GUARD =
  process.env.ANALYTICS_PIPELINE_DEV_GUARD ?? "1";

// 25 chars: 'c' + 24 lowercase alphanumerics — matches Prisma's cuid() v1 regex.
const TEST_TENANT_ID = "cverify000000000000000000";
const TEST_EVENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5VVV";
const VALID_ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TEST_OCCURRED_AT = new Date("2026-04-15T12:00:00.000Z");

type CheckResult = { pass: boolean; reason: string };

const results: { name: string; result: CheckResult }[] = [];

function record(name: string, result: CheckResult) {
  results.push({ name, result });
  const mark = result.pass ? "✓" : "✗";
  // eslint-disable-next-line no-console
  console.log(`  ${mark} ${name}${result.reason ? "  — " + result.reason : ""}`);
}

async function check(
  name: string,
  fn: () => Promise<CheckResult>,
): Promise<void> {
  try {
    const r = await fn();
    record(name, r);
  } catch (err) {
    record(name, {
      pass: false,
      reason:
        "threw: " + (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("Phase 0 verification — analytics pipeline foundation\n");

  const { prisma, _unguardedAnalyticsPipelineClient } = await import(
    "@/app/_lib/db/prisma"
  );
  const {
    withTenant,
    AnalyticsTenantMissingError,
  } = await import("@/app/_lib/analytics/pipeline/tenant");
  const { BaseEventSchema } = await import(
    "@/app/_lib/analytics/pipeline/schemas/base"
  );
  const { ServiceTier } = await import(
    "@/app/_lib/analytics/pipeline/tiers"
  );
  const { isAnalyticsEnabledForTenant } = await import(
    "@/app/_lib/analytics/pipeline/feature-flag"
  );
  const { analyticsBreadcrumb, analyticsSpan } = await import(
    "@/app/_lib/analytics/pipeline/observability"
  );
  const { readFileSync, existsSync } = await import("node:fs");

  // ── 1. multiSchema fence ────────────────────────────────────────────────
  await check("multiSchema fence: prisma.analyticsPipelineEvent is a model", async () => {
    const c = _unguardedAnalyticsPipelineClient as unknown as Record<string, unknown>;
    const ok = typeof c.analyticsPipelineEvent === "object" &&
               typeof c.analyticsPipelineOutbox === "object" &&
               typeof c.analyticsPipelineTenantConfig === "object";
    return { pass: ok, reason: ok ? "all 3 pipeline models present on Prisma client" : "Prisma client missing pipeline models" };
  });

  // ── 2. analytics schema exists ──────────────────────────────────────────
  await check("analytics schema exists", async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM pg_namespace WHERE nspname = 'analytics'
    `;
    const ok = Number(rows[0]?.count ?? 0n) === 1;
    return { pass: ok, reason: ok ? "" : "pg_namespace.analytics not found" };
  });

  // ── 3. analytics.event partitioned + 7 monthly + default ────────────────
  await check("analytics.event has 7 monthly partitions + default", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT child.relname AS name
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      JOIN pg_namespace ns ON parent.relnamespace = ns.oid
      WHERE ns.nspname = 'analytics' AND parent.relname = 'event'
      ORDER BY child.relname
    `;
    const names = rows.map((r) => r.name);
    const expected = [
      "event_2026_04", "event_2026_05", "event_2026_06", "event_2026_07",
      "event_2026_08", "event_2026_09", "event_2026_10", "event_default",
    ];
    const missing = expected.filter((n) => !names.includes(n));
    const ok = missing.length === 0 && names.length === 8;
    return { pass: ok, reason: ok ? `${names.length} partitions found` : `missing: ${missing.join(", ")}` };
  });

  // ── 4. outbox + tenant_config tables exist ──────────────────────────────
  await check("analytics.outbox and analytics.tenant_config tables exist", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'analytics' AND table_name IN ('outbox', 'tenant_config')
      ORDER BY table_name
    `;
    const ok = rows.length === 2;
    return { pass: ok, reason: ok ? "" : `found: ${rows.map((r) => r.table_name).join(", ") || "none"}` };
  });

  // ── 5. all expected indexes exist ───────────────────────────────────────
  await check("all expected indexes present in analytics schema", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'analytics'
    `;
    const names = new Set(rows.map((r) => r.indexname));
    const expected = [
      "event_pkey",
      "event_tenant_id_occurred_at_idx",
      "event_tenant_id_event_name_occurred_at_idx",
      "outbox_pkey",
      "outbox_tenant_id_event_id_key",
      "outbox_pending_idx",
      "tenant_config_pkey",
    ];
    const missing = expected.filter((n) => !names.has(n));
    const ok = missing.length === 0;
    return { pass: ok, reason: ok ? `${expected.length}/${expected.length} parent-level indexes` : `missing: ${missing.join(", ")}` };
  });

  // ── 6. all expected CHECK constraints exist ─────────────────────────────
  await check("all expected CHECK constraints present", async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT DISTINCT conname FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'analytics' AND c.contype = 'c'
    `;
    const names = new Set(rows.map((r) => r.conname));
    const expected = [
      "event_tenant_id_nonempty", "event_event_name_nonempty",
      "event_actor_type_enum", "event_actor_consistency",
      "event_schema_version_semver", "event_received_after_occurred",
      "outbox_tenant_id_nonempty", "outbox_event_name_nonempty",
      "outbox_actor_type_enum", "outbox_actor_consistency",
      "outbox_failed_count_nonnegative",
      "tenant_config_tenant_id_nonempty",
      "tenant_config_data_retention_positive",
      "tenant_config_enabled_at_consistency",
    ];
    const missing = expected.filter((n) => !names.has(n));
    const ok = missing.length === 0;
    return { pass: ok, reason: ok ? `${expected.length}/${expected.length} CHECKs` : `missing: ${missing.join(", ")}` };
  });

  // ── 7. tenant_id NOT NULL enforced ──────────────────────────────────────
  await check("tenant_id NOT NULL enforced on analytics.event", async () => {
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO analytics.event (event_id, tenant_id, event_name, schema_version, occurred_at, actor_type, actor_id, payload)
        VALUES ('${TEST_EVENT_ID}_null', NULL, 'test', '1.0.0', NOW(), 'system', NULL, '{}')
      `);
      return { pass: false, reason: "INSERT with NULL tenant_id was accepted" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Postgres NOT NULL violation = SQLSTATE 23502. Match by code so this
      // works regardless of Prisma's wrapper wording across versions.
      const looksLikeNotNullViolation = msg.includes("23502") ||
        /null value in column.*tenant_id/i.test(msg) || /not-null/i.test(msg);
      return { pass: looksLikeNotNullViolation, reason: looksLikeNotNullViolation ? "rejected with not-null violation (SQLSTATE 23502)" : `unexpected error: ${msg.slice(0, 150)}` };
    }
  });

  // ── 8. withTenant("") throws ────────────────────────────────────────────
  await check('withTenant("") throws AnalyticsTenantMissingError', async () => {
    try {
      await withTenant("", async () => undefined);
      return { pass: false, reason: "did not throw" };
    } catch (err) {
      const ok = err instanceof AnalyticsTenantMissingError;
      return { pass: ok, reason: ok ? "threw AnalyticsTenantMissingError" : `wrong error: ${(err as Error).constructor.name}` };
    }
  });

  // ── 9. withTenant(<valid>) injects tenant_id ────────────────────────────
  await check("withTenant(valid CUID) injects tenant_id on create + read", async () => {
    let createdTenantId: string | null = null;
    try {
      await withTenant(TEST_TENANT_ID, async (db) => {
        await db.analyticsPipelineEvent.create({
          data: {
            eventId: TEST_EVENT_ID,
            // tenantId intentionally OMITTED — must be injected
            eventName: "phase0_verify",
            schemaVersion: "1.0.0",
            occurredAt: TEST_OCCURRED_AT,
            actorType: "system",
            actorId: null,
            payload: { verify: "phase0" },
          },
        });
        const found = await db.analyticsPipelineEvent.findUnique({
          where: {
            eventId_occurredAt: {
              eventId: TEST_EVENT_ID,
              occurredAt: TEST_OCCURRED_AT,
            },
          },
        });
        createdTenantId = found?.tenantId ?? null;
      });
      const ok = createdTenantId === TEST_TENANT_ID;
      return { pass: ok, reason: ok ? `read back tenant_id=${createdTenantId}` : `tenant_id mismatch (got ${createdTenantId})` };
    } finally {
      // Cleanup via raw SQL — bypasses guard, no scope needed
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM analytics.event WHERE event_id = '${TEST_EVENT_ID}'`,
        );
      } catch {
        // ignore cleanup failure
      }
    }
  });

  // ── 10. BaseEventSchema rejects malformed inputs ────────────────────────
  await check("BaseEventSchema rejects malformed events", async () => {
    const validBase = {
      event_id: VALID_ULID,
      tenant_id: TEST_TENANT_ID,
      event_name: "x",
      schema_version: "1.0.0",
      occurred_at: new Date(),
      payload: {},
      actor_type: "system" as const,
      actor_id: null,
    };
    const cases = [
      { name: "bad ULID", input: { ...validBase, event_id: "not-a-ulid" } },
      { name: "bad semver", input: { ...validBase, schema_version: "1.0" } },
      { name: "guest with null actor_id", input: { ...validBase, actor_type: "guest", actor_id: null } },
      { name: "system with non-null actor_id", input: { ...validBase, actor_type: "system", actor_id: "u1" } },
    ];
    const failures: string[] = [];
    for (const c of cases) {
      const r = BaseEventSchema.safeParse(c.input);
      if (r.success) failures.push(c.name);
    }
    const ok = failures.length === 0;
    return { pass: ok, reason: ok ? "all 4 malformed shapes rejected" : `accepted: ${failures.join(", ")}` };
  });

  // ── 11. BaseEventSchema accepts a valid event ───────────────────────────
  await check("BaseEventSchema accepts a valid event", async () => {
    const r = BaseEventSchema.safeParse({
      event_id: VALID_ULID,
      tenant_id: TEST_TENANT_ID,
      event_name: "phase0_verify",
      schema_version: "1.0.0",
      occurred_at: new Date(),
      correlation_id: null,
      payload: { ok: true },
      context: null,
      actor_type: "guest",
      actor_id: "guest-123",
    });
    return { pass: r.success, reason: r.success ? "" : `parse error: ${r.error.message.slice(0, 150)}` };
  });

  // ── 12. Sentry helpers callable without throwing ────────────────────────
  await check("analyticsBreadcrumb and analyticsSpan callable without throwing", async () => {
    analyticsBreadcrumb("verify", "phase0 ping", { foo: "bar" });
    const result = await analyticsSpan(
      "phase0.verify",
      { tenant_id: TEST_TENANT_ID, pipeline_step: "verify" },
      async () => 42,
    );
    return { pass: result === 42, reason: result === 42 ? "span returned wrapped value" : `unexpected return: ${result}` };
  });

  // ── 13. isAnalyticsEnabledForTenant("nonexistent") → false ──────────────
  await check('isAnalyticsEnabledForTenant returns false when no row exists', async () => {
    const v = await isAnalyticsEnabledForTenant(TEST_TENANT_ID);
    return { pass: v === false, reason: v === false ? "default-false honored" : `unexpected: ${v}` };
  });

  // ── 14. ServiceTier + tiers.md ──────────────────────────────────────────
  await check("ServiceTier enum + docs/analytics/tiers.md", async () => {
    const enumOk = ServiceTier.TIER_1 === 1 && ServiceTier.TIER_2 === 2 &&
                   ServiceTier.TIER_3 === 3 && ServiceTier.TIER_4 === 4;
    const docPath = "docs/analytics/tiers.md";
    const docExists = existsSync(docPath);
    const docNonEmpty = docExists && readFileSync(docPath, "utf8").trim().length > 0;
    const ok = enumOk && docNonEmpty;
    return { pass: ok, reason: ok ? "" : `enumOk=${enumOk} docExists=${docExists} docNonEmpty=${docNonEmpty}` };
  });

  // ── 15. Dev guard fires on direct prisma.<pipeline-model>.* access ──────
  await check("dev guard blocks direct pipeline-model access", async () => {
    if (process.env.NODE_ENV === "production") {
      return { pass: true, reason: "n/a in production (guard hard-disabled)" };
    }
    try {
      await prisma.analyticsPipelineEvent.findFirst({});
      return { pass: false, reason: "guard did not fire" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ok = msg.includes("[analytics-pipeline]") && msg.includes("withTenant");
      return { pass: ok, reason: ok ? "guard threw with helper pointer" : `wrong error: ${msg.slice(0, 150)}` };
    }
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.result.pass).length;
  const total = results.length;
  // eslint-disable-next-line no-console
  console.log(
    `\nPhase 0: ${passed}/${total} passed${passed === total ? "" : " — " + (total - passed) + " FAILED"}`,
  );

  await prisma.$disconnect();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("verify-phase0 crashed:", err);
  process.exit(1);
});
