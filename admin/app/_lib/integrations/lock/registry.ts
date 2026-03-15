import type { LockAdapter } from "./adapter";
import type { LockProvider } from "./types";
import { FakeLockAdapter, FakeLockCredentialsSchema } from "../adapters/lock";
import { SaltoAdapter, SaltoCredentialsSchema } from "../adapters/salto";

/**
 * Factory that returns the correct LockAdapter for a given provider.
 * Follows same pattern as getAdapter() in registry.ts (PMS layer).
 */
export function getLockAdapter(
  provider: LockProvider,
  credentials?: Record<string, string>,
): LockAdapter {
  switch (provider) {
    case "manual":
    case "fake": {
      const parsed = FakeLockCredentialsSchema.parse(credentials ?? { scenario: "happy" });
      return new FakeLockAdapter(parsed);
    }

    case "salto": {
      // Salto adapter is a stub — use FakeLockAdapter in dev until implemented
      if (process.env.NODE_ENV === "development") {
        const parsed = FakeLockCredentialsSchema.parse(credentials ?? { scenario: "happy" });
        return new FakeLockAdapter(parsed);
      }
      if (!credentials) {
        throw new Error("Salto adapter requires credentials");
      }
      const parsed = SaltoCredentialsSchema.parse(credentials);
      return new SaltoAdapter(parsed);
    }

    case "assa_abloy":
    case "nuki":
      throw new Error(`Lock adapter not yet implemented for provider: ${provider}`);

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown lock provider: ${_exhaustive}`);
    }
  }
}
