import { redirect } from "next/navigation";

/**
 * Redirect /stays → /search (301)
 *
 * The search page moved to /search. This redirect ensures
 * bookmarked and linked /stays URLs still work.
 */
export default async function StaysRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/search${qs ? `?${qs}` : ""}`);
}
