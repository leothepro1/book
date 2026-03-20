/**
 * POST /api/guest-auth/logout
 *
 * Destroys the guest session cookie.
 * Same pattern as magic-link session clearing.
 */

import { NextResponse } from "next/server";
import { clearGuestSession } from "@/app/_lib/magic-link/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearGuestSession();
  return NextResponse.json({ success: true });
}
