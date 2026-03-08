/**
 * Google Wallet renderer — STUB.
 *
 * This adapter will eventually:
 *  - Create Google Wallet objects via the Google Pay API
 *  - Generate JWT-based "Add to Google Wallet" links
 *  - Handle object updates for revocation/expiry changes
 *
 * For now: logs the render request as an audit event and returns a
 * placeholder link. Core functionality (issue/revoke/validate) works
 * independently of this adapter.
 */

import { logPassEvent } from "../events";
import type { WalletRenderer, PlatformRef } from "../types";

export const googleRenderer: WalletRenderer = {
  platform: "GOOGLE",

  async ensure(passId: string, tenantId: string): Promise<PlatformRef> {
    await logPassEvent({
      tenantId,
      passId,
      type: "RENDERED_GOOGLE",
      metadata: { stub: true, message: "Google Wallet rendering not yet implemented" },
    });

    return {
      platform: "GOOGLE",
      externalId: `google-stub-${passId}`,
      addLink: `#google-wallet-not-implemented`,
    };
  },

  async getAddLink(passId: string, _tenantId: string): Promise<string | null> {
    return `#google-wallet-not-implemented-${passId}`;
  },

  async refresh(passId: string, tenantId: string): Promise<void> {
    await logPassEvent({
      tenantId,
      passId,
      type: "RENDERED_GOOGLE",
      metadata: { stub: true, action: "refresh" },
    });
  },
};
