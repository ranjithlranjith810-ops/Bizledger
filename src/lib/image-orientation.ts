// Client-side logo normalization.
//
// Some uploaded logos (typically phone photos / scanned assets) carry EXIF
// orientation metadata. Browsers honor that metadata when painting an <img>,
// but the PDF renderer (pdf-lib embedJpg/embedPng) does NOT — it embeds the
// raw pixel buffer, so a landscape photo stored as a portrait JPEG comes out
// rotated/squashed in the PDF. Baking the orientation into actual pixels at
// upload time makes the Settings preview, the on-screen invoice header and the
// generated PDF all agree. The PDF's contain-fit math then sees the true
// display dimensions and keeps the rendered width/height ratio equal to the
// source ratio.

const MAX_EDGE = 2048;

/**
 * Re-encodes a data-URL image with its EXIF orientation baked into the pixels,
 * at the browser's natural display size (capped at MAX_EDGE on the long side).
 *
 * - JPEG sources are re-encoded as JPEG (quality 92) — the original has no
 *   alpha channel, so nothing is lost by staying in JPEG.
 * - PNG sources are re-encoded as PNG so any transparency is preserved.
 * - SVG / other mime types and any decode failure fall back to the input
 *   unchanged.
 */
export function bakeLogoOrientation(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith("data:image/jpeg") && !dataUrl.startsWith("data:image/png")) {
      resolve(dataUrl);
      return;
    }
    const img = document.createElement("img");
    img.onload = () => {
      const w = (img.naturalWidth || img.width) || 1;
      const h = (img.naturalHeight || img.height) || 1;
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      try {
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        const out = dataUrl.startsWith("data:image/png")
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", 0.92);
        resolve(out.length > 0 ? out : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}