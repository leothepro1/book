/**
 * Email Block Renderer
 * ════════════════════
 *
 * Shared rendering for EmailAppTemplate blocks JSON → HTML.
 * Used by both the automation worker and campaign sender.
 *
 * V1 blocks: array of { type, content, url?, src?, alt? }.
 * Variable substitution supports dotted keys: {{guest.firstName}}.
 */

// ── Variable substitution ──────────────────────────────────────

/**
 * Replace {{dotted.variable}} placeholders with values.
 * Supports dotted keys like {{guest.firstName}}, {{tenant.name}}.
 * Missing variables are left as-is.
 */
export function renderVariables(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

// ── Block rendering ────────────────────────────────────────────

/**
 * Render email blocks JSON to an HTML document.
 * Each block renders to a simple inline-styled HTML element.
 */
export function renderEmailBlocks(
  blocks: unknown,
  vars: Record<string, string> = {},
): string {
  if (!Array.isArray(blocks)) {
    return typeof blocks === "string" ? renderVariables(blocks, vars) : "";
  }

  const rendered = blocks.map((block) => {
    if (typeof block !== "object" || block === null) return "";
    const b = block as Record<string, unknown>;
    const type = String(b.type ?? "text");
    const content = String(b.content ?? "");
    const renderedContent = renderVariables(content, vars);

    switch (type) {
      case "heading":
        return `<h1 style="font-size:24px;font-weight:600;color:#1a1a1a;margin:0 0 16px">${renderedContent}</h1>`;
      case "text":
        return `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px">${renderedContent}</p>`;
      case "button": {
        const url = String(b.url ?? "#");
        const renderedUrl = renderVariables(url, vars);
        return `<a href="${renderedUrl}" style="display:inline-block;padding:12px 24px;background:#1a56db;color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500">${renderedContent}</a>`;
      }
      case "divider":
        return `<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />`;
      case "image": {
        const src = String(b.src ?? "");
        const alt = String(b.alt ?? "");
        return `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:0 0 16px" />`;
      }
      default:
        return `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px">${renderedContent}</p>`;
    }
  });

  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
    ${rendered.join("\n    ")}
  </div>
</body>
</html>`;
}
