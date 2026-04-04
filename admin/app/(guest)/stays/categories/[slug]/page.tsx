import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { ACCOMMODATION_SELECT } from "@/app/_lib/accommodations/types";
import { resolveAccommodation } from "@/app/_lib/accommodations/resolve";
import type { AccommodationWithRelations } from "@/app/_lib/accommodations/types";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { getRequestLocale } from "@/app/(guest)/_lib/locale/getRequestLocale";
import { applyTranslations, applyTranslationsBatch } from "@/app/_lib/translations/apply-db-translations";

export const revalidate = 60;
export const dynamicParams = true;

export default async function AccommodationCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const category = await prisma.accommodationCategory.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          accommodation: {
            select: ACCOMMODATION_SELECT,
          },
        },
      },
    },
  });

  if (!category || category.status !== "ACTIVE") return notFound();

  // Apply locale translations to category title/description
  const locale = await getRequestLocale();
  const translatedCat = await applyTranslations(
    tenant.id, locale, "accommodation-category", category.id,
    { title: category.title, description: category.description ?? "" },
    ["title", "description"],
  );
  category.title = translatedCat.title as string;
  if (translatedCat.description) category.description = translatedCat.description as string;

  const accommodations = category.items
    .map((item) => resolveAccommodation(item.accommodation as unknown as AccommodationWithRelations))
    .filter((a) => a.status === "ACTIVE");

  // Translate accommodation names + descriptions in batch
  const accForTranslation = accommodations.map((a) => ({
    id: a.id,
    name: a.displayName,
    description: a.displayDescription ?? "",
  }));
  await applyTranslationsBatch(tenant.id, locale, "accommodation", accForTranslation, ["name", "description"]);
  for (let i = 0; i < accommodations.length; i++) {
    accommodations[i].displayName = accForTranslation[i].name;
    accommodations[i].displayDescription = accForTranslation[i].description;
  }

  return (
    <div className="cp">
      <div className="cp__header">
        <h1 className="cp__title">{category.title}</h1>
        {category.description && (
          <p className="cp__description">{category.description}</p>
        )}
      </div>

      <div className="cp__grid">
        {accommodations.map((acc) => {
          const image = acc.media[0];
          const capacity = acc.minGuests === acc.maxGuests
            ? `${acc.maxGuests} gäster`
            : `${acc.minGuests}–${acc.maxGuests} gäster`;

          return (
            <Link
              key={acc.id}
              href={`/stays/${acc.slug}`}
              className="cp__card"
            >
              <div className="cp__card-image">
                {image ? (
                  <img src={image.url} alt={image.altText || acc.displayName} />
                ) : (
                  <div className="cp__card-placeholder" />
                )}
              </div>
              <div className="cp__card-info">
                <h3 className="cp__card-title">{acc.displayName}</h3>
                <span className="cp__card-price">
                  {acc.basePricePerNight > 0
                    ? `Från ${formatPriceDisplay(acc.basePricePerNight, acc.currency)} kr/natt`
                    : capacity}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {accommodations.length === 0 && (
        <p className="cp__empty">Inga boenden i denna kategori.</p>
      )}
    </div>
  );
}
