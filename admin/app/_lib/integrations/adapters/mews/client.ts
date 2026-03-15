/**
 * Mews HTTP Client
 *
 * Typed HTTP client for the Mews Connector API.
 * - Injects auth tokens into every request body
 * - Selects base URL based on environment
 * - Rate limiting: simple in-memory token bucket (200 req / 30 sec)
 * - Retry on 429/503 with delay
 * - Never logs credentials
 */

import type { MewsCredentials } from "./credentials";
import { getMewsBaseUrl } from "./credentials";

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

/** Per-AccessToken rate limit state. */
const tokenBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(accessToken: string): boolean {
  const now = Date.now();
  let bucket = tokenBuckets.get(accessToken);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    tokenBuckets.set(accessToken, bucket);
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return false; // Rate limit would be exceeded
  }

  bucket.count++;
  return true;
}

function msUntilReset(accessToken: string): number {
  const bucket = tokenBuckets.get(accessToken);
  if (!bucket) return 0;
  return Math.max(0, bucket.resetAt - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MewsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly endpoint: string,
    public readonly retriable: boolean,
  ) {
    super(message);
    this.name = "MewsApiError";
  }
}

export class MewsClient {
  private readonly baseUrl: string;
  private readonly credentials: MewsCredentials;

  constructor(credentials: MewsCredentials) {
    this.credentials = credentials;
    this.baseUrl = getMewsBaseUrl(credentials);
  }

  async post<TRequest extends Record<string, unknown>, TResponse>(
    endpoint: string,
    body: TRequest,
  ): Promise<TResponse> {
    const url = `${this.baseUrl}/api/connector/v1/${endpoint}`;

    // Inject auth into body — Mews uses body-level auth, not headers
    const fullBody = {
      ClientToken: this.credentials.clientToken,
      AccessToken: this.credentials.accessToken,
      Client: this.credentials.clientName,
      ...body,
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Rate limit check — wait if bucket is full
      if (!checkRateLimit(this.credentials.accessToken)) {
        const waitMs = msUntilReset(this.credentials.accessToken);
        if (attempt >= MAX_RETRIES) {
          throw new MewsApiError(429, "Rate limit exceeded after retries", endpoint, true);
        }
        await sleep(waitMs + 100); // Small buffer
        continue;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullBody),
      });

      if (response.ok) {
        return (await response.json()) as TResponse;
      }

      const status = response.status;
      const retriable = status === 429 || status === 503;

      if (retriable && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      // Non-retriable or exhausted retries
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        errorMessage = (errorBody as Record<string, unknown>)?.Message as string
          ?? (errorBody as Record<string, unknown>)?.message as string
          ?? `HTTP ${status}`;
      } catch {
        errorMessage = `HTTP ${status}`;
      }

      throw new MewsApiError(status, errorMessage, endpoint, retriable);
    }

    // Should not reach here — but TypeScript needs a return
    throw new MewsApiError(500, "Unexpected: exhausted retry loop", endpoint, false);
  }
}
