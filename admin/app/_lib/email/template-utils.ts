/**
 * Email Template Utilities
 * ════════════════════════
 *
 * Pure functions for template rendering and preview text injection.
 * No side effects, no imports with external dependencies.
 * Used by send.ts and directly testable without mocking.
 */

/**
 * Replace {{variableName}} placeholders with values from vars.
 * Missing variables are left as-is. Extra variables are ignored.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    return Object.prototype.hasOwnProperty.call(vars, name)
      ? vars[name]
      : match;
  });
}

/**
 * Inject a hidden preview text span into the HTML email.
 * Inserted immediately after the opening <body> tag, or prepended
 * if no <body> tag exists.
 *
 * The padding with &nbsp;&zwnj; prevents email clients from pulling
 * body copy into the preview snippet — standard industry practice.
 */
export function injectPreviewText(html: string, previewText: string): string {
  const encoded = previewText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const hiddenSpan =
    `<span style="display:none;max-height:0;overflow:hidden;` +
    `mso-hide:all;visibility:hidden;opacity:0;font-size:1px;color:#ffffff">` +
    `${encoded}${"&nbsp;&zwnj;".repeat(Math.max(0, 90 - previewText.length))}` +
    `</span>`;

  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const insertIndex = bodyMatch.index! + bodyMatch[0].length;
    return html.slice(0, insertIndex) + hiddenSpan + html.slice(insertIndex);
  }

  return hiddenSpan + html;
}
