/**
 * Mailchimp Adapter — implements EmailMarketingAdapter.
 *
 * API base: https://{datacenter}.api.mailchimp.com/3.0
 * Auth: Basic auth (username: "anystring", password: API key)
 * Member ID: MD5 hash of lowercase email
 * status_if_new: "subscribed" — never resubscribe unsubscribed contacts
 */

import { createHash } from "node:crypto";
import { resilientFetch } from "@/app/_lib/http/fetch";
import type { EmailMarketingAdapter, EmailContact, EmailList } from "../types";

export class RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
  }
}

class MailchimpAdapter implements EmailMarketingAdapter {
  readonly provider = "mailchimp";
  readonly name = "Mailchimp";

  private getBaseUrl(apiKey: string): string {
    const dc = apiKey.split("-").pop() ?? "us21";
    return `https://${dc}.api.mailchimp.com/3.0`;
  }

  private getAuthHeader(apiKey: string): string {
    return `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;
  }

  private getMemberHash(email: string): string {
    return createHash("md5").update(email.toLowerCase().trim()).digest("hex");
  }

  async upsertContact(apiKey: string, listId: string, contact: EmailContact): Promise<void> {
    const hash = this.getMemberHash(contact.email);
    const url = `${this.getBaseUrl(apiKey)}/lists/${listId}/members/${hash}`;

    const res = await resilientFetch(url, { service: "mailchimp", timeout: 10_000,
      method: "PUT",
      headers: {
        authorization: this.getAuthHeader(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email_address: contact.email,
        status_if_new: "subscribed",
        merge_fields: {
          FNAME: contact.firstName ?? "",
          LNAME: contact.lastName ?? "",
          PHONE: contact.phone ?? "",
          BOOKINGS: String(contact.totalBookings ?? 0),
          SPEND: String((contact.totalSpend ?? 0) / 100),
          LASTBOOK: contact.lastBookingDate ?? "",
          GUESTID: contact.guestId ?? "",
        },
        language: contact.language ?? "",
      }),
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("x-ratelimit-reset") ?? "60", 10);
      throw new RateLimitError("Mailchimp rate limit exceeded", retryAfter);
    }

    if (!res.ok && res.status !== 400) {
      const text = await res.text();
      throw new Error(`Mailchimp upsert failed: ${res.status} ${text.slice(0, 200)}`);
    }
  }

  async removeContact(apiKey: string, listId: string, email: string): Promise<void> {
    const hash = this.getMemberHash(email);
    const url = `${this.getBaseUrl(apiKey)}/lists/${listId}/members/${hash}`;

    await resilientFetch(url, { service: "mailchimp", timeout: 10_000,
      method: "DELETE",
      headers: { authorization: this.getAuthHeader(apiKey) },
    });
  }

  async getLists(apiKey: string): Promise<EmailList[]> {
    const url = `${this.getBaseUrl(apiKey)}/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count`;

    const res = await resilientFetch(url, { service: "mailchimp", timeout: 10_000,
      headers: { authorization: this.getAuthHeader(apiKey) },
    });

    if (!res.ok) throw new Error(`Mailchimp getLists failed: ${res.status}`);

    const data = await res.json();
    return (data.lists ?? []).map((l: Record<string, unknown>) => ({
      id: String(l.id),
      name: String(l.name),
      memberCount: (l.stats as Record<string, number>)?.member_count ?? 0,
    }));
  }

  async addTags(apiKey: string, listId: string, email: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    const hash = this.getMemberHash(email);
    const url = `${this.getBaseUrl(apiKey)}/lists/${listId}/members/${hash}/tags`;

    const res = await resilientFetch(url, { service: "mailchimp", timeout: 10_000,
      method: "POST",
      headers: {
        authorization: this.getAuthHeader(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags: tags.map((name) => ({ name, status: "active" })) }),
    });

    if (!res.ok && res.status !== 400) {
      throw new Error(`Mailchimp addTags failed: ${res.status}`);
    }
  }

  async removeTags(apiKey: string, listId: string, email: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    const hash = this.getMemberHash(email);
    const url = `${this.getBaseUrl(apiKey)}/lists/${listId}/members/${hash}/tags`;

    const res = await resilientFetch(url, { service: "mailchimp", timeout: 10_000,
      method: "POST",
      headers: {
        authorization: this.getAuthHeader(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags: tags.map((name) => ({ name, status: "inactive" })) }),
    });

    if (!res.ok && res.status !== 400) {
      throw new Error(`Mailchimp removeTags failed: ${res.status}`);
    }
  }

  async trackEvent(apiKey: string, listId: string, email: string, eventName: string, properties: Record<string, unknown>): Promise<void> {
    const hash = this.getMemberHash(email);
    const url = `${this.getBaseUrl(apiKey)}/lists/${listId}/members/${hash}/events`;

    await resilientFetch(url, { service: "mailchimp", timeout: 10_000,
      method: "POST",
      headers: {
        authorization: this.getAuthHeader(apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: eventName,
        properties: Object.fromEntries(
          Object.entries(properties).map(([k, v]) => [k, String(v)]),
        ),
      }),
    });
  }

  async validateCredentials(apiKey: string): Promise<{ valid: boolean; accountName?: string; error?: string }> {
    try {
      const res = await resilientFetch(`${this.getBaseUrl(apiKey)}/`, {
        service: "mailchimp", timeout: 10_000,
        headers: { authorization: this.getAuthHeader(apiKey) },
      });

      if (!res.ok) {
        if (res.status === 401) return { valid: false, error: "Ogiltig API-nyckel" };
        return { valid: false, error: `Mailchimp svarade med ${res.status}` };
      }

      const data = await res.json();
      return { valid: true, accountName: data.account_name ?? data.company ?? "Mailchimp" };
    } catch (err) {
      const dc = apiKey.split("-").pop() ?? "";
      if (!dc || dc.length < 2) return { valid: false, error: "Ogiltigt datacenter i API-nyckeln — nyckeln ska sluta med t.ex. -us21" };
      return { valid: false, error: `Kunde inte ansluta: ${String(err).slice(0, 100)}` };
    }
  }
}

export const mailchimpAdapter = new MailchimpAdapter();
