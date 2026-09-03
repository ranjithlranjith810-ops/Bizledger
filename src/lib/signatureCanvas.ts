// Pure, browser-only helpers for turning a signature drawing canvas into a
// clean, cropped, transparent PNG. Kept free of React/DOM state so the pixel
// logic can be unit-tested independently of the UI.

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * alphaThresholdForRow/alphaThresholdForCol use this to decide whether a pixel
 * is "ink". Any pixel with alpha above the threshold is signature ink.
 */
export const INK_ALPHA_THRESHOLD = 8;

/**
 * Returns the tight bounding box (inclusive) of pixels whose alpha exceeds the
 * ink threshold, within an RGBA ImageData of the given dimensions.
 *
 * When no ink is present this returns null so callers can reject empty
 * signatures before saving.
 */
export function findSignatureBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > INK_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // fully empty
  return { left: minX, top: minY, right: maxX, bottom: maxY };
}

/**
 * Whether there is any drawn ink on the canvas. Used to reject saving an empty
 * signature.
 */
export function isCanvasEmpty(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  return findSignatureBounds(data, width, height) === null;
}

/**
 * Expands a tight bounding box by `padding` pixels on every side, clamped to
 * the canvas dimensions. Guarantees the returned box never exceeds the source.
 */
export function applyPadding(
  bounds: Bounds,
  width: number,
  height: number,
  padding: number
): Bounds {
  const horizontalPadding = Math.max(0, Math.round(padding));
  const verticalPadding = Math.max(0, Math.round(padding));
  return {
    left: Math.max(0, bounds.left - horizontalPadding),
    top: Math.max(0, bounds.top - verticalPadding),
    right: Math.min(width - 1, bounds.right + horizontalPadding),
    bottom: Math.min(height - 1, bounds.bottom + verticalPadding),
  };
}

/**
 * Computes the destination height for rendering a cropped signature while
 * preserving aspect ratio, given a target display height. Returns an integer
 * and never returns 0.
 */
export function displayHeightFor(
  sourceWidth: number,
  sourceHeight: number,
  targetHeight: number
): number {
  if (sourceWidth <= 0 || sourceHeight <= 0) return targetHeight;
  const scale = targetHeight / sourceHeight;
  return Math.max(1, Math.round(sourceWidth * scale));
}

/**
 * Renders the cropped signature region of `source` onto a fresh transparent
 * canvas and returns a PNG data URL with transparency preserved.
 *
 * @param source the drawing canvas
 * @param opts.padding pixels of safe whitespace added around the ink
 * @param opts.scale up-scale factor for print-quality (default 2)
 */
export function exportCroppedSignature(
  source: HTMLCanvasElement,
  opts: { padding?: number; scale?: number } = {}
): string {
  const { padding = 14, scale = 2 } = opts;
  const ctx = source.getContext("2d");
  if (!ctx) return "";

  const { width, height } = source;
  const imageData = ctx.getImageData(0, 0, width, height);
  const bounds = findSignatureBounds(
    imageData.data,
    width,
    height
  );

  // Nothing drawn — never export a blank image.
  if (!bounds) return "";

  const padded = applyPadding(bounds, width, height, padding);
  const cropW = padded.right - padded.left + 1;
  const cropH = padded.bottom - padded.top + 1;

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropW * scale));
  out.height = Math.max(1, Math.round(cropH * scale));
  const outCtx = out.getContext("2d");
  if (!outCtx) return "";

  outCtx.clearRect(0, 0, out.width, out.height);
  outCtx.drawImage(
    source,
    padded.left,
    padded.top,
    cropW,
    cropH,
    0,
    0,
    out.width,
    out.height
  );

  return out.toDataURL("image/png");
}