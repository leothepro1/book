/**
 * GeoIP Resolution — MaxMind GeoLite2
 * ════════════════════════════════════
 *
 * Resolves city/country from IP address.
 * Upserts AnalyticsLocation — one row per unique city.
 * Returns locationId to store on AnalyticsEvent.
 *
 * Never stores raw IP. City centroid only — GDPR compliant.
 */

import path from "path";
import { existsSync } from "fs";
import { prisma } from "@/app/_lib/db/prisma";

// Lazy-loaded reader — GeoLite2 DB may not be available in all environments
let readerPromise: Promise<unknown> | null = null;

async function getReader(): Promise<unknown> {
  if (readerPromise) return readerPromise;

  readerPromise = (async () => {
    try {
      const dbPath = path.join(process.cwd(), "lib/geo/GeoLite2-City.mmdb");
      if (!existsSync(dbPath)) {
        // Silent — geo is optional, not critical
        return null;
      }
      const { Reader } = await import("@maxmind/geoip2-node");
      return await Reader.open(dbPath);
    } catch {
      // GeoLite2 DB not available — geo will be null
      return null;
    }
  })();

  return readerPromise;
}

export type GeoResult = {
  locationId: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
} | null;

export async function resolveGeo(ip: string): Promise<GeoResult> {
  try {
    const reader = await getReader() as { city: (ip: string) => {
      country?: { isoCode?: string };
      city?: { names?: { en?: string } };
      location?: { latitude?: number; longitude?: number };
    } } | null;

    if (!reader) return null;

    const cleanIp = ip.replace(/^::ffff:/, "");
    const result = reader.city(cleanIp);

    const country = result.country?.isoCode ?? null;
    const city = result.city?.names?.en ?? country ?? null;
    const lat = result.location?.latitude ?? null;
    const lng = result.location?.longitude ?? null;

    if (!country || !city || lat === null || lng === null) return null;

    const location = await prisma.analyticsLocation.upsert({
      where: { country_city: { country, city } },
      create: { country, city, lat, lng },
      update: {},
      select: { id: true, country: true, city: true, lat: true, lng: true },
    });

    return {
      locationId: location.id,
      country: location.country,
      city: location.city,
      lat: location.lat,
      lng: location.lng,
    };
  } catch {
    return null;
  }
}
