/**
 * Mews HTTP Client
 *
 * Typed HTTP client for the Mews Connector API.
 * - Injects auth tokens into every request body
 * - Selects base URL based on environment
 * - Rate limiting: database-backed token bucket (200 req / 30 sec)
 * - 10-second timeout on every request
 * - Retry on 429/503 with delay
 * - Never logs credentials
 */

import type { MewsCredentials } from "./credentials";
import { getMewsBaseUrl } from "./credentials";
import { consumeRateLimit } from "./rate-limiter";
import { resilientFetch } from "@/app/_lib/http/fetch";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;
const TIMEOUT_MS = 10_000;

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
      // Database-backed rate limit check
      await consumeRateLimit(this.credentials.accessToken);

      try {
        const response = await resilientFetch(url, {
          service: "mews", timeout: TIMEOUT_MS,
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
      } catch (error) {
        if (error instanceof MewsApiError) throw error;

        if (error instanceof Error && error.name === "AbortError") {
          throw new MewsApiError(
            408,
            "Mews API svarade inte inom 10 sekunder",
            endpoint,
            true,
          );
        }

        // Network error — retriable
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        throw new MewsApiError(
          0,
          error instanceof Error ? error.message : "Nätverksfel",
          endpoint,
          true,
        );
      } finally {
        // resilientFetch handles timeout cleanup internally
      }
    }

    throw new MewsApiError(500, "Unexpected: exhausted retry loop", endpoint, false);
  }
}
