/**
 * PMS Adapter Registry
 *
 * Maps PmsProvider → PmsAdapter instance.
 * ManualAdapter is a singleton (no credentials).
 * PMS adapters (Mews, etc.) are instantiated per-tenant with credentials.
 *
 * Adding a new PMS = implementing PmsAdapter + adding a case here.
 */

import type { PmsAdapter } from "./adapter";
import type { PmsProvider } from "./types";
import { ManualAdapter } from "./adapters/manual";
import { MewsAdapter } from "./adapters/mews";
import { MewsCredentialsSchema } from "./adapters/mews/credentials";
import { FakeAdapter, FakeCredentialsSchema } from "./adapters/fake";

const manualAdapter = new ManualAdapter();

/**
 * Get an adapter for the given provider.
 *
 * For "manual": returns singleton, credentials ignored.
 * For "mews": requires credentials, returns a new MewsAdapter instance.
 * For "fake": requires credentials (scenario config), dev only.
 */
export function getAdapter(
  provider: PmsProvider,
  credentials?: Record<string, string>,
): PmsAdapter {
  switch (provider) {
    case "manual":
      return manualAdapter;

    case "mews": {
      if (!credentials) {
        throw new Error("Mews adapter requires credentials");
      }
      const parsed = MewsCredentialsSchema.parse(credentials);
      return new MewsAdapter(parsed);
    }

    case "fake": {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Fake adapter is not available in production");
      }
      if (!credentials) {
        throw new Error("Fake adapter requires credentials");
      }
      const parsed = FakeCredentialsSchema.parse(credentials);
      return new FakeAdapter(parsed);
    }

    case "apaleo":
    case "opera":
      throw new Error(`Adapter not yet implemented for provider: ${provider}`);

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
