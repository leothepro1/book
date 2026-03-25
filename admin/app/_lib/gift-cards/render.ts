/**
 * Gift Card PNG Renderer
 * ══════════════════════
 *
 * Converts a DesignConfig into a PNG buffer using sharp.
 * Output: 1040×662px (2x retina of 520×331 display size).
 *
 * Three background modes:
 *   fill     — solid color
 *   gradient — SVG linear gradient rendered to PNG
 *   image    — remote image fetched and resized to cover
 *
 * Logo composited centered on top of background.
 */

import sharp from "sharp";
import type { DesignConfig } from "./actions";

const WIDTH = 1040;
const HEIGHT = 662;
const BORDER_RADIUS = 40; // 20px × 2 for retina

// ── Hex parsing ─────────────────────────────────────────────────

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ── Rounded corners mask ────────────────────────────────────────

function roundedRectSvg(): Buffer {
  return Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="${BORDER_RADIUS}" ry="${BORDER_RADIUS}" fill="white"/>
    </svg>`,
  );
}

// ── Background generators ───────────────────────────────────────

function solidBackground(color: string): Buffer {
  const { r, g, b } = parseHex(color);
  return Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="rgb(${r},${g},${b})"/>
    </svg>`,
  );
}

function gradientBackground(
  color1: string,
  color2: string,
  direction: "down" | "up",
): Buffer {
  const y1 = direction === "down" ? "0%" : "100%";
  const y2 = direction === "down" ? "100%" : "0%";
  return Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <linearGradient id="g" x1="0%" y1="${y1}" x2="0%" y2="${y2}">
          <stop offset="0%" stop-color="${color1}"/>
          <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
    </svg>`,
  );
}

async function imageBackground(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch background image: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return sharp(Buffer.from(arrayBuffer))
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
}

// ── Logo fetching + sizing ──────────────────────────────────────

async function fetchAndResizeLogo(logoUrl: string): Promise<Buffer> {
  const res = await fetch(logoUrl);
  if (!res.ok) throw new Error(`Failed to fetch logo: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const maxW = Math.round(WIDTH * 0.6);
  const maxH = Math.round(HEIGHT * 0.4);

  return sharp(Buffer.from(arrayBuffer))
    .resize(maxW, maxH, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

// ── Main render function ────────────────────────────────────────

/**
 * Renders a gift card design to a PNG buffer.
 *
 * @param config - Design configuration (colors, mode, logo)
 * @param bgImageUrl - Background image URL (only used when bgMode=image)
 * @returns PNG buffer at 1040×662 (2x retina)
 */
export async function renderGiftCardPNG(
  config: DesignConfig,
  bgImageUrl?: string,
): Promise<Buffer> {
  // 1. Generate background
  let bgBuffer: Buffer;
  switch (config.bgMode) {
    case "gradient":
      bgBuffer = gradientBackground(
        config.bgColor,
        config.bgGradientColor2,
        config.bgGradientDir,
      );
      break;
    case "image":
      if (bgImageUrl) {
        bgBuffer = await imageBackground(bgImageUrl);
      } else {
        bgBuffer = solidBackground(config.bgColor);
      }
      break;
    case "fill":
    default:
      bgBuffer = solidBackground(config.bgColor);
      break;
  }

  // 2. Start with background, apply rounded corners
  const composites: sharp.OverlayOptions[] = [];

  // 3. Logo compositing (centered)
  if (config.logoUrl) {
    try {
      const logoBuffer = await fetchAndResizeLogo(config.logoUrl);
      const logoMeta = await sharp(logoBuffer).metadata();

      const logoW = logoMeta.width ?? 200;
      const logoH = logoMeta.height ?? 100;
      const left = Math.round((WIDTH - logoW) / 2);
      const top = Math.round((HEIGHT - logoH) / 2);

      composites.push({ input: logoBuffer, left, top });
    } catch {
      // Logo fetch failed — render without logo
    }
  }

  // 4. Build final image
  let pipeline = sharp(bgBuffer).resize(WIDTH, HEIGHT);

  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }

  // 5. Apply rounded corners via mask
  const mask = roundedRectSvg();
  pipeline = pipeline.composite([
    ...composites,
    { input: mask, blend: "dest-in" },
  ]);

  // Re-do: sharp composite order matters. Build properly:
  const base = await sharp(bgBuffer).resize(WIDTH, HEIGHT).png().toBuffer();

  let result = sharp(base);
  if (composites.length > 0) {
    result = result.composite(composites);
  }

  // Apply rounded corner mask
  const withContent = await result.png().toBuffer();
  const final = await sharp(withContent)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return final;
}
