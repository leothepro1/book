/**
 * SEO Engine — Text Utilities
 * ═══════════════════════════
 *
 * Minimal text helpers used by adapters when lifting domain entities
 * into `Seoable`. Deliberately small — no rich-text JSON parsers,
 * no Markdown renderers. Adapters whose descriptions arrive as
 * plain text with HTML tags can call `stripHtml` to produce SEO-safe
 * output.
 */

/**
 * Strip HTML tags, collapse whitespace, and decode a minimal set of
 * HTML entities commonly produced by rich-text editors.
 *
 * This is NOT an HTML sanitizer — it is a one-way lossy conversion
 * to plain text for use in title/description metadata. SEO output
 * is not an XSS surface (it ends up inside `<meta content="...">`
 * where content is auto-escaped by the renderer), but we still
 * discard tag contents like `<script>...</script>` as a matter of
 * defensive hygiene.
 *
 * Entities decoded: `&amp; &lt; &gt; &quot; &#39; &nbsp;`. Unknown
 * numeric and named entities pass through unchanged — the caller
 * either never sees them (platform-authored content) or the minor
 * cosmetic glitch is acceptable (merchant-authored content).
 *
 * Never throws. Always returns a string.
 */
export function stripHtml(input: string): string {
  if (input.length === 0) return "";

  // Remove <script> and <style> blocks wholesale — tag and content both.
  // Defensive: a merchant pasting `<script>alert(1)</script>Hello` must
  // end up with "Hello", not the script body leaking into the meta tag.
  let out = input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Strip remaining tags (content between them is preserved).
  out = out.replace(/<[^>]*>/g, "");

  // Decode the minimal entity set.
  out = out
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");

  // Collapse all whitespace (including newlines and tabs) to single spaces,
  // then trim.
  out = out.replace(/\s+/g, " ").trim();

  return out;
}
