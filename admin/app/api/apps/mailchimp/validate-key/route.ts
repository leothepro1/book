import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { mailchimpAdapter } from "@/app/_lib/apps/email-marketing/adapters/mailchimp";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const apiKey = body.apiKey as string;
  if (!apiKey?.trim()) return NextResponse.json({ valid: false, error: "API-nyckel saknas" });

  const result = await mailchimpAdapter.validateCredentials(apiKey);
  return NextResponse.json(result);
}
