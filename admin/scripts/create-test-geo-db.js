#!/usr/bin/env node
/**
 * Seeds test AnalyticsLocation records for development.
 * Used when GeoLite2 mmdb is not available.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const TEST_LOCATIONS = [
  { country: "SE", city: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { country: "SE", city: "Gothenburg", lat: 57.7089, lng: 11.9746 },
  { country: "SE", city: "Malmö", lat: 55.605, lng: 13.0038 },
  { country: "NO", city: "Oslo", lat: 59.9139, lng: 10.7522 },
  { country: "DK", city: "Copenhagen", lat: 55.6761, lng: 12.5683 },
  { country: "DE", city: "Berlin", lat: 52.52, lng: 13.405 },
  { country: "GB", city: "London", lat: 51.5074, lng: -0.1278 },
  { country: "US", city: "New York", lat: 40.7128, lng: -74.006 },
  { country: "JP", city: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { country: "AU", city: "Sydney", lat: -33.8688, lng: 151.2093 },
];

async function seed() {
  for (const loc of TEST_LOCATIONS) {
    await prisma.analyticsLocation.upsert({
      where: { country_city: { country: loc.country, city: loc.city } },
      create: loc,
      update: {},
    });
  }
  console.log(`Seeded ${TEST_LOCATIONS.length} test locations`);
  await prisma.$disconnect();
}

seed().catch(console.error);
