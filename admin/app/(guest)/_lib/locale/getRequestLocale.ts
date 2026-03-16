import { headers } from "next/headers";
import { PRIMARY_LOCALE } from "@/app/_lib/translations/locales";

/**
 * Read the resolved locale from the middleware-set header.
 * Returns PRIMARY_LOCALE if no locale header is present.
 */
export async function getRequestLocale(): Promise<string> {
  const h = await headers();
  return h.get("x-tenant-locale") ?? PRIMARY_LOCALE;
}
