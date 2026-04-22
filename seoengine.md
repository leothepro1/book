# Bedfront SEO Engine — arkitektur & implementation

Shopify-pattern, gemensam motor, alla entity-typer flyter igenom samma rör.

---

## Kärnprinciperna — det här är kontraktet

1. **Ett centralt API, inte per-entity-kod.** Produkter, boenden, sidor, kategorier, blog posts — alla SEO-relaterade frågor går igenom *samma* `SeoResolver`. Entity-typer är "plugins" via en adapter, inte separata codepaths.

2. **Tre nivåer av data, tydlig fallback-kedja.** `Tenant defaults` → `PageType pattern` → `Entity override`. Varje fält (titel, description, OG-bild, canonical) resolvas via samma kedja.

3. **Seoable är kontraktet.** Varje entity-typ exponerar sig som `Seoable` via en adapter. Adaptern översätter domänmodellen till SEO-språk. Ingen annan kod i SEO-motorn vet vad en "Accommodation" är.

4. **Resolved output är en canonical shape.** Resolvern returnerar alltid samma `ResolvedSeo`-objekt oavsett entity-typ. Konsumenterna (Next.js metadata, admin preview, sitemap, JSON-LD, OG image generator) läser alltid samma shape.

5. **Lifting, inte nedärvning.** Adaptrar är funktioner som *lyfter* en domän-entity till en `Seoable` — inte basklasser som entities ärver från. Det här är Shopifys GraphQL-pattern (`interface SEO { title, description }` på alla resource types) men i TypeScript: strukturell typing, inga classes.

6. **All resolution är tenant-scoped.** Ingen SEO-state är global. Varje resolution-anrop börjar med en tenant, slutar med tenant-specifik URL.

7. **Pure functions där möjligt.** Själva resolution-logiken är deterministisk — samma input ger samma output, testbart utan mocks. Side effects (image URL generation, async fetches) isoleras i tydligt märkta service-anrop.

---

## Data-modellen

### Shared JSONB på varje seoable entity

```prisma
// prisma/schema.prisma

model Accommodation {
  id              String    @id @default(cuid())
  tenantId        String
  handle          String
  title           String
  description     String?   @db.Text
  featuredImageId String?
  publishedAt     DateTime?
  updatedAt       DateTime  @updatedAt
  
  // SEO overrides — shape valideras via Zod (SeoMetadataSchema)
  seo             Json?
  
  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  
  @@unique([tenantId, handle])
  @@index([tenantId, publishedAt])
}

model Product {
  // ... samma mönster
  seo Json?
}

model Page {
  // ... samma mönster
  seo Json?
}

model AccommodationCategory {
  seo Json?
}

model ProductCollection {
  seo Json?
}

model Article {
  seo Json?
}

model Blog {
  seo Json?
}
```

**Varför JSONB och inte separat tabell:** SEO-data är alltid 1:1 med entity, ingen cross-entity-query, lever och dör med entity. Det här är exakt vad Shopify gör med sitt `seo`-fält på GraphQL-resurser. Migrerbarhet via Zod-schema som evolveras, inte via ALTER TABLE.

### Tenant-nivå defaults

```prisma
model Tenant {
  id             String  @id
  siteName       String
  primaryDomain  String
  defaultLocale  String  @default("sv")
  
  // Shape: SeoDefaultsSchema (Zod)
  seoDefaults    Json?
  
  pageTypeSeoDefaults PageTypeSeoDefault[]
  seoRedirects        SeoRedirect[]
}
```

### Per-type pattern (Shopifys "Theme SEO settings"-motsvarighet)

```prisma
model PageTypeSeoDefault {
  id                  String      @id @default(cuid())
  tenantId            String
  pageType            SeoPageType
  
  titlePattern        String?     // "{entity.title} | {tenant.siteName}"
  descriptionPattern  String?     // "{entity.shortDescription | truncate:155}"
  ogImagePattern      String?     // "{entity.featuredImage}"
  structuredDataEnabled Boolean  @default(true)
  
  tenant Tenant @relation(fields: [tenantId], references: [id])
  
  @@unique([tenantId, pageType])
}

enum SeoPageType {
  HOMEPAGE
  ACCOMMODATION
  ACCOMMODATION_CATEGORY
  ACCOMMODATION_INDEX
  PRODUCT
  PRODUCT_COLLECTION
  PRODUCT_INDEX
  PAGE
  ARTICLE
  BLOG
  SEARCH
  NOT_FOUND
}
```

### Hantering av handle-ändringar (301-redirects)

```prisma
model SeoRedirect {
  id         String   @id @default(cuid())
  tenantId   String
  fromPath   String   // "/accommodations/old-handle"
  toPath     String   // "/accommodations/new-handle"
  statusCode Int      @default(301)
  createdAt  DateTime @default(now())
  
  tenant Tenant @relation(fields: [tenantId], references: [id])
  
  @@unique([tenantId, fromPath])
  @@index([tenantId, fromPath])
}
```

När en merchant ändrar handle i admin: automatiskt skapa SeoRedirect-rad från gamla pathen till nya. Middleware i Next.js som kollar denna tabell före 404. Shopifys exakta mönster — deras URL Redirects-feature.

---

## Shared TypeScript types & Zod schemas

```ts
// lib/seo/types.ts

import { z } from 'zod';

export const SeoResourceTypes = [
  'homepage',
  'accommodation',
  'accommodation_category',
  'accommodation_index',
  'product',
  'product_collection',
  'product_index',
  'page',
  'article',
  'blog',
  'search',
] as const;
export type SeoResourceType = typeof SeoResourceTypes[number];

// Per-entity SEO overrides (stored i `seo` JSONB på entity)
export const SeoMetadataSchema = z.object({
  title: z.string().trim().max(255).optional(),
  description: z.string().trim().max(500).optional(),
  canonicalPath: z.string().startsWith('/').optional(),
  ogImageId: z.string().optional(),
  ogImageAlt: z.string().max(420).optional(),
  twitterCardType: z.enum(['summary', 'summary_large_image']).optional(),
  noindex: z.boolean().default(false),
  nofollow: z.boolean().default(false),
  structuredDataExtensions: z.array(z.record(z.unknown())).optional(),
}).strict();
export type SeoMetadata = z.infer<typeof SeoMetadataSchema>;

// Per-tenant defaults (stored i Tenant.seoDefaults JSONB)
export const SeoDefaultsSchema = z.object({
  titleTemplate: z.string().default('{entityTitle} | {siteName}'),
  descriptionDefault: z.string().optional(),
  ogImageId: z.string().optional(),
  faviconId: z.string().optional(),
  twitterSite: z.string().regex(/^@/).optional(),
  organizationSchema: z.record(z.unknown()).optional(),
  localBusinessSchema: z.record(z.unknown()).optional(),
}).strict();
export type SeoDefaults = z.infer<typeof SeoDefaultsSchema>;

// Seoable — kontraktet varje entity-typ måste kunna exponeras som.
// Adaptrarna producerar detta; resolvern konsumerar det.
export interface Seoable {
  readonly resourceType: SeoResourceType;
  readonly id: string;
  readonly tenantId: string;
  readonly path: string;                    // canonical relative path
  readonly title: string;                    // fallback-källa för SEO-titel
  readonly description?: string | null;      // fallback-källa för description (plain text, rich stripped)
  readonly featuredImageId?: string | null;  // fallback-källa för OG image
  readonly seoOverrides?: SeoMetadata | null;
  readonly updatedAt: Date;
  readonly publishedAt?: Date | null;
  readonly locale: string;                   // för hreflang-resolution
}

// Resolution input
export interface SeoResolutionContext {
  tenant: {
    id: string;
    siteName: string;
    primaryDomain: string;
    defaultLocale: string;
    seoDefaults: SeoDefaults;
    activeLocales: string[];
  };
  resourceType: SeoResourceType;
  entity: unknown;                // kastad till rätt typ via adapter
  locale: string;
  pagination?: { page: number; totalPages: number };
  tags?: string[];
  searchQuery?: string;           // för search-sidor
}

// Resolution output — single canonical shape
export interface ResolvedSeo {
  title: string;
  description: string | null;
  canonicalUrl: string;                       // absolute
  canonicalPath: string;                       // relative
  noindex: boolean;
  nofollow: boolean;
  openGraph: {
    type: 'website' | 'article' | 'product';
    url: string;
    title: string;
    description: string | null;
    siteName: string;
    locale: string;
    image: ResolvedImage | null;
  };
  twitterCard: {
    card: 'summary' | 'summary_large_image';
    site: string | null;
    title: string;
    description: string | null;
    image: ResolvedImage | null;
  };
  hreflang: Array<{ code: string; url: string }>;
  structuredData: StructuredDataObject[];    // JSON-LD objects
}

export interface ResolvedImage {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

export type StructuredDataObject = Record<string, unknown> & {
  '@context': 'https://schema.org';
  '@type': string;
};
```

---

## Adapter-registry

### Interfacet

```ts
// lib/seo/adapters/base.ts

import type { Seoable, SeoResourceType, StructuredDataObject } from '../types';

export interface SeoAdapter<TEntity = unknown> {
  readonly resourceType: SeoResourceType;
  
  /**
   * Lyft en domän-entity till Seoable.
   * Pure function — inga side effects.
   */
  toSeoable(entity: TEntity, tenant: Tenant): Seoable;
  
  /**
   * Generera adapter-specifik JSON-LD.
   * Körs bara om PageTypeSeoDefault.structuredDataEnabled = true.
   */
  toStructuredData(entity: TEntity, tenant: Tenant, locale: string): StructuredDataObject[];
  
  /**
   * Ska denna entity indexeras av sökmotorer?
   * Default: published + inte noindex i overrides.
   */
  isIndexable(entity: TEntity): boolean;
  
  /**
   * Generera sitemap-entries (kan vara 1 eller flera URL:er per entity).
   */
  getSitemapEntries(entity: TEntity, tenant: Tenant, locales: string[]): SitemapEntry[];
  
  /**
   * Tillåter adapter-specifik OG-bild-generering.
   * Returnera null för att falla tillbaka till featuredImage → tenant default.
   */
  getAdapterOgImage?(entity: TEntity, tenant: Tenant): ResolvedImage | null;
}

// Registry
const adapters = new Map<SeoResourceType, SeoAdapter>();

export function registerSeoAdapter<T>(adapter: SeoAdapter<T>): void {
  adapters.set(adapter.resourceType, adapter as SeoAdapter);
}

export function getSeoAdapter(type: SeoResourceType): SeoAdapter {
  const adapter = adapters.get(type);
  if (!adapter) throw new Error(`No SEO adapter registered for ${type}`);
  return adapter;
}

export function getAllSeoAdapters(): SeoAdapter[] {
  return Array.from(adapters.values());
}
```

### Exempel: Accommodation-adapter

```ts
// lib/seo/adapters/accommodation.ts

import type { Accommodation, Tenant } from '@prisma/client';
import { SeoMetadataSchema } from '../types';
import { stripRichText } from '../text';
import { type SeoAdapter } from './base';

export const accommodationSeoAdapter: SeoAdapter<Accommodation> = {
  resourceType: 'accommodation',
  
  toSeoable(entity, tenant) {
    const overrides = entity.seo 
      ? SeoMetadataSchema.parse(entity.seo)
      : undefined;
    
    return {
      resourceType: 'accommodation',
      id: entity.id,
      tenantId: entity.tenantId,
      path: `/accommodations/${entity.handle}`,
      title: entity.title,
      description: entity.description ? stripRichText(entity.description) : null,
      featuredImageId: entity.featuredImageId,
      seoOverrides: overrides,
      updatedAt: entity.updatedAt,
      publishedAt: entity.publishedAt,
      locale: entity.locale ?? tenant.defaultLocale,
    };
  },
  
  toStructuredData(entity, tenant, locale) {
    const base = {
      '@context': 'https://schema.org' as const,
      '@type': 'Accommodation',
      name: entity.title,
      description: stripRichText(entity.description ?? ''),
      occupancy: {
        '@type': 'QuantitativeValue',
        maxValue: entity.maxOccupancy,
      },
      numberOfRooms: entity.numberOfRooms,
      amenityFeature: entity.amenities?.map(a => ({
        '@type': 'LocationFeatureSpecification',
        name: a.name,
        value: true,
      })),
    };
    
    // Bookable som Product för Google Merchant
    const product = entity.bookable ? [{
      '@context': 'https://schema.org' as const,
      '@type': 'Product',
      name: entity.title,
      description: stripRichText(entity.description ?? ''),
      offers: {
        '@type': 'Offer',
        price: entity.basePrice,
        priceCurrency: tenant.currency,
        availability: entity.available 
          ? 'https://schema.org/InStock' 
          : 'https://schema.org/OutOfStock',
      },
    }] : [];
    
    return [base, ...product];
  },
  
  isIndexable(entity) {
    if (entity.publishedAt === null) return false;
    const overrides = entity.seo ? SeoMetadataSchema.parse(entity.seo) : null;
    return !overrides?.noindex;
  },
  
  getSitemapEntries(entity, tenant, locales) {
    return locales.map(locale => ({
      url: absoluteUrl(tenant, `/${locale === tenant.defaultLocale ? '' : locale + '/'}accommodations/${entity.handle}`),
      lastmod: entity.updatedAt,
      alternates: locales.map(l => ({
        hreflang: l,
        url: absoluteUrl(tenant, `/${l === tenant.defaultLocale ? '' : l + '/'}accommodations/${entity.handle}`),
      })),
    }));
  },
};
```

Detta är **hela** accommodation-specifika SEO-koden. Samma mönster för Product, Page, etc. När du lägger till en ny entity-typ (säg `EventSpace`) skriver du en adapter på ~50 rader och registrerar den — ingenting annat i SEO-motorn behöver röras.

### Auto-registrering

```ts
// lib/seo/adapters/index.ts

import { registerSeoAdapter } from './base';
import { accommodationSeoAdapter } from './accommodation';
import { accommodationCategorySeoAdapter } from './accommodation-category';
import { productSeoAdapter } from './product';
import { productCollectionSeoAdapter } from './product-collection';
import { pageSeoAdapter } from './page';
import { articleSeoAdapter } from './article';
import { blogSeoAdapter } from './blog';
import { homepageSeoAdapter } from './homepage';

registerSeoAdapter(homepageSeoAdapter);
registerSeoAdapter(accommodationSeoAdapter);
registerSeoAdapter(accommodationCategorySeoAdapter);
registerSeoAdapter(productSeoAdapter);
registerSeoAdapter(productCollectionSeoAdapter);
registerSeoAdapter(pageSeoAdapter);
registerSeoAdapter(articleSeoAdapter);
registerSeoAdapter(blogSeoAdapter);

export { getSeoAdapter, getAllSeoAdapters } from './base';
```

Importera denna modul från root layout eller en bootstrap-fil — adapters registreras automatiskt.

---

## SeoResolver — kärnmotorn

```ts
// lib/seo/resolver.ts

import type {
  SeoResolutionContext,
  ResolvedSeo,
  Seoable,
  ResolvedImage,
} from './types';
import { getSeoAdapter } from './adapters/base';
import { interpolate } from './interpolation';
import { resolveHreflang } from './hreflang';
import { ImageService } from './image-service';
import { PageTypeSeoDefaultRepository } from './page-type-defaults';

export class SeoResolver {
  constructor(
    private readonly imageService: ImageService,
    private readonly pageTypeDefaults: PageTypeSeoDefaultRepository,
  ) {}
  
  async resolve(ctx: SeoResolutionContext): Promise<ResolvedSeo> {
    const adapter = getSeoAdapter(ctx.resourceType);
    const seoable = adapter.toSeoable(ctx.entity, ctx.tenant);
    const typeDefaults = await this.pageTypeDefaults.get(ctx.tenant.id, ctx.resourceType);
    
    const title = this.resolveTitle(seoable, typeDefaults, ctx);
    const description = this.resolveDescription(seoable, typeDefaults, ctx);
    const ogImage = await this.resolveOgImage(seoable, adapter, ctx);
    const canonical = this.resolveCanonical(seoable, ctx);
    const hreflang = await resolveHreflang(ctx, adapter);
    const noindex = this.resolveNoindex(seoable, adapter);
    const structuredData = this.mergeStructuredData(seoable, adapter, typeDefaults, ctx);
    
    return {
      title,
      description,
      canonicalUrl: canonical.absolute,
      canonicalPath: canonical.relative,
      noindex,
      nofollow: seoable.seoOverrides?.nofollow ?? false,
      openGraph: {
        type: this.ogTypeFor(ctx.resourceType),
        url: canonical.absolute,
        title,
        description,
        siteName: ctx.tenant.siteName,
        locale: this.toOgLocale(ctx.locale),
        image: ogImage,
      },
      twitterCard: {
        card: seoable.seoOverrides?.twitterCardType ?? 'summary_large_image',
        site: ctx.tenant.seoDefaults.twitterSite ?? null,
        title,
        description,
        image: ogImage,
      },
      hreflang,
      structuredData,
    };
  }
  
  // ——— Title resolution ———
  // Fallback-kedja:
  //   1. entity.seoOverrides.title (explicit admin-input)
  //   2. pageTypeDefaults.titlePattern interpolerat med entity+tenant
  //   3. tenantDefaults.titleTemplate interpolerat med entity.title+siteName
  // Sedan: pagination + tag-suffix
  private resolveTitle(
    seoable: Seoable, 
    typeDefaults: PageTypeSeoDefault | null,
    ctx: SeoResolutionContext,
  ): string {
    const rawTitle =
      seoable.seoOverrides?.title ||
      (typeDefaults?.titlePattern && interpolate(typeDefaults.titlePattern, { entity: seoable, tenant: ctx.tenant })) ||
      interpolate(ctx.tenant.seoDefaults.titleTemplate, {
        entityTitle: seoable.title,
        siteName: ctx.tenant.siteName,
      });
    
    // Pagination suffix — förhindrar boilerplate-titlar över paginated listor
    let title = rawTitle;
    if (ctx.pagination && ctx.pagination.page > 1) {
      title += ` – Page ${ctx.pagination.page}`;
    }
    
    // Tag suffix — samma princip
    if (ctx.tags?.length) {
      title += ` – tagged "${ctx.tags.join(', ')}"`;
    }
    
    // Search query suffix
    if (ctx.searchQuery) {
      title = `Search results for "${ctx.searchQuery}" | ${ctx.tenant.siteName}`;
    }
    
    return title;
  }
  
  // ——— Description resolution ———
  private resolveDescription(
    seoable: Seoable,
    typeDefaults: PageTypeSeoDefault | null,
    ctx: SeoResolutionContext,
  ): string | null {
    const raw =
      seoable.seoOverrides?.description ||
      (typeDefaults?.descriptionPattern && interpolate(typeDefaults.descriptionPattern, { entity: seoable, tenant: ctx.tenant })) ||
      seoable.description ||
      ctx.tenant.seoDefaults.descriptionDefault ||
      null;
    
    if (!raw) return null;
    
    // Max 500 chars enligt vår schema; Google trunkerar runt 155-160 i SERP
    return raw.length > 500 ? raw.slice(0, 497) + '...' : raw;
  }
  
  // ——— OG Image resolution ———
  // Fallback-kedja:
  //   1. entity.seoOverrides.ogImageId
  //   2. adapter.getAdapterOgImage() (för special cases)
  //   3. entity.featuredImageId
  //   4. tenant.seoDefaults.ogImageId
  //   5. dynamiskt genererad OG-bild (Satori/ImageResponse) med title + brand
  private async resolveOgImage(
    seoable: Seoable,
    adapter: SeoAdapter,
    ctx: SeoResolutionContext,
  ): Promise<ResolvedImage | null> {
    const overrideId = seoable.seoOverrides?.ogImageId;
    if (overrideId) {
      return this.imageService.getOgImage(overrideId, {
        alt: seoable.seoOverrides?.ogImageAlt,
      });
    }
    
    const adapterImage = adapter.getAdapterOgImage?.(ctx.entity, ctx.tenant);
    if (adapterImage) return adapterImage;
    
    if (seoable.featuredImageId) {
      return this.imageService.getOgImage(seoable.featuredImageId);
    }
    
    const tenantDefaultId = ctx.tenant.seoDefaults.ogImageId;
    if (tenantDefaultId) {
      return this.imageService.getOgImage(tenantDefaultId);
    }
    
    // Fallback: dynamisk OG-bild med title + tenant branding
    return this.imageService.generateDynamicOgImage({
      title: seoable.title,
      siteName: ctx.tenant.siteName,
      tenantId: ctx.tenant.id,
    });
  }
  
  // ——— Canonical resolution ———
  // Respekterar override, annars bygger från seoable.path + tenant.primaryDomain.
  // Self-canonical på alla locale-varianter (hreflang hanterar cross-locale-linking).
  private resolveCanonical(
    seoable: Seoable,
    ctx: SeoResolutionContext,
  ): { absolute: string; relative: string } {
    const relative = seoable.seoOverrides?.canonicalPath ?? this.buildPath(seoable, ctx);
    const absolute = `https://${ctx.tenant.primaryDomain}${relative}`;
    return { absolute, relative };
  }
  
  private buildPath(seoable: Seoable, ctx: SeoResolutionContext): string {
    // För default locale: "/accommodations/stuga-1"
    // För andra locales: "/en/accommodations/stuga-1"
    if (ctx.locale === ctx.tenant.defaultLocale) {
      return seoable.path;
    }
    return `/${ctx.locale}${seoable.path}`;
  }
  
  // ——— Noindex resolution ———
  private resolveNoindex(seoable: Seoable, adapter: SeoAdapter): boolean {
    if (seoable.seoOverrides?.noindex) return true;
    return !adapter.isIndexable(seoable as any);
  }
  
  // ——— Structured data merging ———
  // Kedja:
  //   1. Tenant-level Organization schema (alltid med på homepage)
  //   2. Tenant-level LocalBusiness schema (om satt)
  //   3. Adapter-producerad schema (Accommodation, Product, etc.)
  //   4. Entity-level extensions (power user JSON-LD från admin)
  private mergeStructuredData(
    seoable: Seoable,
    adapter: SeoAdapter,
    typeDefaults: PageTypeSeoDefault | null,
    ctx: SeoResolutionContext,
  ): StructuredDataObject[] {
    const result: StructuredDataObject[] = [];
    
    // Tenant-level schemas — bara på homepage
    if (ctx.resourceType === 'homepage') {
      if (ctx.tenant.seoDefaults.organizationSchema) {
        result.push(ctx.tenant.seoDefaults.organizationSchema as StructuredDataObject);
      }
      if (ctx.tenant.seoDefaults.localBusinessSchema) {
        result.push(ctx.tenant.seoDefaults.localBusinessSchema as StructuredDataObject);
      }
    }
    
    // Adapter-producerad schema
    if (typeDefaults?.structuredDataEnabled !== false) {
      result.push(...adapter.toStructuredData(ctx.entity, ctx.tenant, ctx.locale));
    }
    
    // Entity-level extensions
    if (seoable.seoOverrides?.structuredDataExtensions) {
      result.push(...(seoable.seoOverrides.structuredDataExtensions as StructuredDataObject[]));
    }
    
    return result;
  }
  
  // ——— OG type mapping ———
  private ogTypeFor(resourceType: SeoResourceType): 'website' | 'article' | 'product' {
    switch (resourceType) {
      case 'article': return 'article';
      case 'product': 
      case 'accommodation': return 'product';
      default: return 'website';
    }
  }
  
  private toOgLocale(locale: string): string {
    // "sv" → "sv_SE", "en" → "en_US", etc.
    const map: Record<string, string> = {
      sv: 'sv_SE',
      en: 'en_US',
      de: 'de_DE',
    };
    return map[locale] ?? locale;
  }
}
```

---

## Konsumenterna — alla läser samma output

### Next.js generateMetadata

```ts
// app/[[...path]]/page.tsx eller per-route

import { cache } from 'react';
import type { Metadata } from 'next';
import { seoResolver } from '@/lib/seo';
import { resolveTenantFromHeaders } from '@/lib/tenants';
import { getAccommodation } from '@/lib/accommodations';

// React cache() dedupar — samma resolve() kallad från generateMetadata
// och page component returnerar cachad result inom samma request.
const resolveSeoCached = cache(seoResolver.resolve.bind(seoResolver));

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await resolveTenantFromHeaders();
  const accommodation = await getAccommodation(tenant.id, slug);
  
  if (!accommodation) return { title: 'Not found', robots: { index: false } };
  
  const resolved = await resolveSeoCached({
    tenant,
    resourceType: 'accommodation',
    entity: accommodation,
    locale: await resolveLocale(),
  });
  
  return toNextMetadata(resolved);
}

export default async function AccommodationPage({ params }) {
  const { slug } = await params;
  const tenant = await resolveTenantFromHeaders();
  const accommodation = await getAccommodation(tenant.id, slug);
  
  const resolved = await resolveSeoCached({
    tenant, resourceType: 'accommodation', entity: accommodation, locale: await resolveLocale(),
  });
  
  return (
    <>
      <StructuredData data={resolved.structuredData} />
      {/* actual page UI */}
    </>
  );
}
```

### ResolvedSeo → Next Metadata converter

```ts
// lib/seo/next-metadata.ts

import type { Metadata } from 'next';
import type { ResolvedSeo } from './types';

export function toNextMetadata(resolved: ResolvedSeo): Metadata {
  return {
    title: resolved.title,
    description: resolved.description,
    alternates: {
      canonical: resolved.canonicalUrl,
      languages: Object.fromEntries(
        resolved.hreflang.map(h => [h.code, h.url])
      ),
    },
    robots: {
      index: !resolved.noindex,
      follow: !resolved.nofollow,
    },
    openGraph: {
      type: resolved.openGraph.type,
      url: resolved.openGraph.url,
      title: resolved.openGraph.title,
      description: resolved.openGraph.description ?? undefined,
      siteName: resolved.openGraph.siteName,
      locale: resolved.openGraph.locale,
      images: resolved.openGraph.image ? [{
        url: resolved.openGraph.image.url,
        width: resolved.openGraph.image.width,
        height: resolved.openGraph.image.height,
        alt: resolved.openGraph.image.alt ?? undefined,
      }] : undefined,
    },
    twitter: {
      card: resolved.twitterCard.card,
      site: resolved.twitterCard.site ?? undefined,
      title: resolved.twitterCard.title,
      description: resolved.twitterCard.description ?? undefined,
      images: resolved.twitterCard.image ? [resolved.twitterCard.image.url] : undefined,
    },
  };
}
```

### StructuredData-komponent

```tsx
// components/seo/StructuredData.tsx

import type { StructuredDataObject } from '@/lib/seo/types';

export function StructuredData({ data }: { data: StructuredDataObject[] }) {
  if (!data.length) return null;
  return (
    <>
      {data.map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}
    </>
  );
}
```

### Sitemap — auto-generated från adapters

```ts
// app/sitemap.ts

import { seoResolver, getAllSeoAdapters } from '@/lib/seo';
import { resolveTenantFromHeaders } from '@/lib/tenants';
import { fetchAllEntitiesOfType } from '@/lib/repositories';

export default async function sitemap() {
  const tenant = await resolveTenantFromHeaders();
  const entries: SitemapEntry[] = [];
  
  for (const adapter of getAllSeoAdapters()) {
    const entities = await fetchAllEntitiesOfType(tenant.id, adapter.resourceType);
    for (const entity of entities) {
      if (adapter.isIndexable(entity)) {
        entries.push(...adapter.getSitemapEntries(entity, tenant, tenant.activeLocales));
      }
    }
  }
  
  return entries.map(e => ({
    url: e.url,
    lastModified: e.lastmod,
    alternates: e.alternates ? { languages: Object.fromEntries(e.alternates.map(a => [a.hreflang, a.url])) } : undefined,
  }));
}
```

### Admin SEO panel — samma komponent, alla entity-typer

```tsx
// components/admin/SeoPanel.tsx

import { useEffect, useState } from 'react';
import type { SeoMetadata, SeoResourceType, ResolvedSeo } from '@/lib/seo/types';
import { previewSeoFromDraft } from '@/lib/seo/preview';

export function SeoPanel({ 
  resourceType,
  entity,
  draftOverrides,
  onChange,
}: {
  resourceType: SeoResourceType;
  entity: { id: string; title: string; handle: string; seo?: SeoMetadata };
  draftOverrides: Partial<SeoMetadata>;
  onChange: (seo: Partial<SeoMetadata>) => void;
}) {
  const [preview, setPreview] = useState<SerpPreview | null>(null);
  
  // Live preview på varje edit
  useEffect(() => {
    const timer = setTimeout(async () => {
      const resolved = await previewSeoFromDraft({
        resourceType,
        entityId: entity.id,
        draftOverrides,
      });
      setPreview(toSerpPreview(resolved));
    }, 300);
    return () => clearTimeout(timer);
  }, [resourceType, entity.id, draftOverrides]);
  
  return (
    <section className="seo-panel">
      <h3>Search engine listing</h3>
      
      {preview && <SerpPreview preview={preview} />}
      
      <Field 
        label="Page title" 
        hint={`Leave empty to use "${entity.title}"`}
        charCount={draftOverrides.title?.length ?? 0}
      >
        <Input
          value={draftOverrides.title ?? ''}
          onChange={v => onChange({ ...draftOverrides, title: v || undefined })}
          placeholder={entity.title}
        />
      </Field>
      
      <Field 
        label="Meta description" 
        hint="Leave empty to let search engines auto-generate"
        charCount={draftOverrides.description?.length ?? 0}
      >
        <Textarea
          value={draftOverrides.description ?? ''}
          onChange={v => onChange({ ...draftOverrides, description: v || undefined })}
          rows={3}
        />
      </Field>
      
      <Field label="URL handle">
        <Input
          value={entity.handle}
          prefix={`${tenant.primaryDomain}${resourceTypeToPathPrefix(resourceType)}/`}
          onChange={...}
        />
      </Field>
      
      <details>
        <summary>Advanced</summary>
        <Field label="Open Graph image">
          <ImagePicker
            value={draftOverrides.ogImageId}
            onChange={v => onChange({ ...draftOverrides, ogImageId: v })}
          />
        </Field>
        <Field label="Canonical URL override">...</Field>
        <Field label="Hide from search engines (noindex)">
          <Toggle
            checked={draftOverrides.noindex ?? false}
            onChange={v => onChange({ ...draftOverrides, noindex: v })}
          />
        </Field>
      </details>
    </section>
  );
}
```

**Viktigt**: `SeoPanel` är en och samma komponent. Product edit page renderar `<SeoPanel resourceType="product" entity={product} ... />`. Accommodation edit renderar `<SeoPanel resourceType="accommodation" entity={accommodation} ... />`. Page edit page — samma.

### Robots.txt — per tenant

```ts
// app/robots.ts

import type { MetadataRoute } from 'next';
import { resolveTenantFromHeaders } from '@/lib/tenants';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const tenant = await resolveTenantFromHeaders();
  const customRules = tenant.robotsTxtOverride;
  
  if (customRules) {
    return customRules; // merchant har editat manuellt
  }
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/_next'],
      },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'anthropic-ai', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'CCBot', allow: '/' },
      { userAgent: 'Applebot', allow: '/' },
    ],
    sitemap: `https://${tenant.primaryDomain}/sitemap.xml`,
  };
}
```

---

## Fil-struktur

```
/lib/seo/
  index.ts                     # public API surface (re-exports)
  types.ts                     # Zod schemas, TypeScript types
  resolver.ts                  # SeoResolver class — kärnmotorn
  interpolation.ts             # pattern variable interpolation ({entity.x})
  canonical.ts                 # canonical URL helpers
  hreflang.ts                  # hreflang resolution
  structured-data.ts           # JSON-LD helpers (stripping, merging)
  image-service.ts             # OG image URL construction + dynamic generation
  next-metadata.ts             # ResolvedSeo → Next.js Metadata converter
  preview.ts                   # Live preview helpers for admin UI
  text.ts                      # stripRichText, truncate utilities
  page-type-defaults.ts        # Repository for PageTypeSeoDefault
  redirects.ts                 # SeoRedirect helpers
  sitemap.ts                   # Sitemap generation (inkl. locale alternates)
  robots.ts                    # robots.txt default generation
  og-image-generator.ts        # Satori/ImageResponse för dynamic OG
  adapters/
    base.ts                    # SeoAdapter interface + registry
    homepage.ts
    accommodation.ts
    accommodation-category.ts
    accommodation-index.ts
    product.ts
    product-collection.ts
    product-index.ts
    page.ts
    article.ts
    blog.ts
    search.ts
    index.ts                   # auto-register alla adapters

/components/seo/
  StructuredData.tsx           # <script type="application/ld+json"> component
  SerpPreview.tsx              # Live SERP preview (Google-styled card)

/components/admin/
  SeoPanel.tsx                 # Shared SEO panel for ALL edit pages
  
/app/
  robots.ts                    # Per-tenant robots.txt
  sitemap.ts                   # Per-tenant sitemap.xml (använder adapters)
  [locale]/
    ...routes                  # Varje route har generateMetadata som använder resolver
```

---

## Implementation-ordning

### Milstolpe 1 — Data-modellen (1 session)
- Prisma migration: lägg till `seo Json?` på Accommodation, Product, Page, AccommodationCategory, ProductCollection, Article, Blog
- Lägg till `seoDefaults Json?` på Tenant
- Skapa `PageTypeSeoDefault`-modell
- Skapa `SeoRedirect`-modell
- Generera Prisma client

### Milstolpe 2 — Types + resolver skeleton (1 session)
- Skapa `lib/seo/types.ts` med alla Zod scheman
- Skapa `lib/seo/adapters/base.ts` — interface + registry
- Skapa `lib/seo/resolver.ts` skelett (tom resolve-funktion som returnerar hårdkodat)
- Skapa `lib/seo/interpolation.ts` — pattern variable substituerare
- Unit-tester för interpolation

### Milstolpe 3 — Första adaptern (1 session)
- Skapa `accommodationSeoAdapter`
- Fullimplementera resolvers alla private metoder: `resolveTitle`, `resolveDescription`, `resolveOgImage`, `resolveCanonical`, `resolveNoindex`, `mergeStructuredData`
- `toNextMetadata`-converter
- Unit-tester: override > pattern > fallback-kedjan för varje fält

### Milstolpe 4 — Integration i Next.js routes (1 session)
- Wire resolver in i `app/accommodations/[slug]/generateMetadata`
- Wire `<StructuredData>` in i page component
- React `cache()`-deduplication för resolver-anrop
- Verifiera via `view-source:` + Facebook Sharing Debugger + Rich Results Test

### Milstolpe 5 — Resterande adapters (1-2 sessioner)
- Product, ProductCollection, Page, AccommodationCategory, Article, Blog, Homepage
- Varje adapter är ~50-100 rader — börja med att kopiera accommodation-adaptern och modifiera

### Milstolpe 6 — Admin UI (1-2 sessioner)
- `SeoPanel.tsx` som shared komponent
- `SerpPreview.tsx` — Google-styled card, live update
- `previewSeoFromDraft` API route för live preview utan save
- Wire in SeoPanel på varje entity edit page

### Milstolpe 7 — Sitemap + robots.txt (1 session)
- `app/sitemap.ts` itererar alla adapters
- `app/robots.ts` med default + custom override
- Test: verifiera hreflang alternates i sitemap

### Milstolpe 8 — Hreflang + multilocale (1-2 sessioner)
- `hreflang.ts` resolver
- Locale-aware `buildPath` i canonical resolution
- Self-canonical per locale verifiering
- x-default handling

### Milstolpe 9 — Structured data polish (1 session)
- Organization + LocalBusiness på tenant-nivå via admin
- Accommodation + Product schema på per-accommodation
- BreadcrumbList för nav-hierarkier
- Rich Results Test-verifiering

### Milstolpe 10 — Dynamic OG image (valfritt men snyggt)
- `og-image-generator.ts` med `next/og` `ImageResponse`
- Fallback om entity saknar featured image: rendera title + tenant logo + brand färger

### Milstolpe 11 — Redirects (1 session)
- SeoRedirect-tabell population vid handle-ändring
- Middleware som checkar SeoRedirect innan 404
- Admin UI för manual redirects

### Milstolpe 12 — Search Console-integration (valfritt)
- Sitemaps API auto-submit vid deploy
- robots.txt-ändringar loggas

---

## De tre icke-förhandlingsbara reglerna

1. **Ingen hårdkodad SEO-kod i page components.** Page-komponenter kallar bara `resolveSeoCached` och returnerar output. Inget specialfall per entity-typ i Next.js-routes.

2. **Alla adapters implementerar samma interface.** Om du frestas lägga till en resource-typ-specifik metod på resolvern — stanna. Det hör hemma på adaptern. Resolvern är entity-agnostisk.

3. **Fallback-kedjan går alltid åt samma håll: Override → Pattern → Fallback.** Bryt aldrig den ordningen för något fält. Varje fält på `ResolvedSeo` ska kunna härledas helt transparent genom kedjan, vilket betyder att varje fält är enhetstestbart på pure-function-nivå.

---

## Bonus: det här är exakt det Shopify gör

| Bedfront-namn | Shopify-motsvarighet |
|---|---|
| `Seoable` interface | GraphQL `interface SEO { title, description }` på alla resource types |
| `accommodationSeoAdapter`, `productSeoAdapter`, ... | Shopifys resource-klasser (Product, Collection, Page) har var sin SEO-resolution |
| `SeoResolver.resolve()` | Shopifys request-time Liquid globals `page_title`, `page_description`, `canonical_url` |
| `toNextMetadata()` | Shopifys `theme.liquid` som renderar `<head>` |
| `SeoPanel.tsx` (shared) | Shopify admins "Search engine listing preview" (samma komponent på Product, Collection, Page, Article edit pages) |
| `PageTypeSeoDefault` | Shopifys theme SEO settings (per resource type) |
| `seo` JSONB på entity | Shopifys `metafields.global.title_tag` + `description_tag` |
| Auto-generated sitemap via adapters | Shopifys auto sitemap.xml (splittat per resource type) |
| `SeoRedirect` table | Shopifys URL Redirects-feature |
| Adapter registry | Shopify extensions via theme apps |

Detta ÄR Shopify-pattern:et. Bygger du enligt ovan har du inte "en SEO-lösning i Bedfront" — du har **Bedfronts SEO-motor**, samma klass av abstraktion som deras.
