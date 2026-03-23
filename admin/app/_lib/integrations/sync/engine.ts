/**
 * Sync Engine — DEPRECATED
 *
 * The old booking sync engine from the guest portal.
 * This is no longer used in the booking engine architecture.
 * Kept as a stub so that existing cron routes don't crash.
 *
 * The booking engine uses real-time PMS queries (getAvailability, etc.)
 * instead of background sync jobs.
 */

/**
 * No-op stub — sync jobs are not used in the booking engine.
 */
export async function runSyncJob(_jobId: string): Promise<void> {
  // No-op — booking engine uses real-time PMS queries
}
