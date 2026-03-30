#!/bin/bash
# Downloads MaxMind GeoLite2-City database
# Requires MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY env vars
# Free account: https://www.maxmind.com/en/geolite2/signup

set -e

ACCOUNT_ID="${MAXMIND_ACCOUNT_ID}"
LICENSE_KEY="${MAXMIND_LICENSE_KEY}"
OUTPUT_DIR="lib/geo"
OUTPUT_FILE="${OUTPUT_DIR}/GeoLite2-City.mmdb"

if [ -z "$ACCOUNT_ID" ] || [ -z "$LICENSE_KEY" ]; then
  echo "Warning: MAXMIND_ACCOUNT_ID or MAXMIND_LICENSE_KEY not set — skipping GeoLite2 download"
  echo "Geo lookups will return null until the database is available"
  exit 0
fi

if [ -f "$OUTPUT_FILE" ]; then
  echo "GeoLite2-City.mmdb already exists — skipping download"
  exit 0
fi

echo "Downloading GeoLite2-City database..."
mkdir -p "$OUTPUT_DIR"

curl -s -L \
  --user "${ACCOUNT_ID}:${LICENSE_KEY}" \
  "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" \
  -o /tmp/geolite2.tar.gz

tar -xzf /tmp/geolite2.tar.gz -C /tmp
find /tmp -name "GeoLite2-City.mmdb" -exec mv {} "$OUTPUT_FILE" \;
rm -f /tmp/geolite2.tar.gz

echo "GeoLite2-City.mmdb downloaded to $OUTPUT_FILE"
