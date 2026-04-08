import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const isValid = url.startsWith("https://") && token.length > 0;

if (!isValid && process.env.NODE_ENV !== "development") {
  console.warn("[redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set");
}

// In dev without real Upstash credentials, export a no-op proxy so
// modules that import `redis` at the top level don't crash on load.
// Rate limiting already bypasses Redis in dev (checkRateLimit returns true).
export const redis: Redis = isValid
  ? new Redis({ url, token })
  : (new Proxy({} as Redis, {
      get(_, prop) {
        if (typeof prop === "string") {
          return () => Promise.resolve(null);
        }
        return undefined;
      },
    }) as Redis);
