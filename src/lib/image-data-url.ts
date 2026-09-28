// Validation for inline image data URLs (company logo + business signature).
//
// The Company Profile stores both of these as base64 `data:image/...;base64,...`
// strings, NOT as URLs to stored files:
//   - CompanyProfileView reads uploads with FileReader.readAsDataURL()
//   - the draw-to-sign canvas emits canvas.toDataURL("image/png")
//   - image-orientation.ts re-encodes an uploaded logo to a data URL too
//
// The PDF renderers decode exactly that shape. embedDataUrlImage() in
// src/lib/print/document-pdf.ts and src/lib/invoice/gst-invoice-pdf.ts both
// bail out to `undefined` unless the value starts with `data:image/` and has a
// png/jpeg base64 body, so a plain http(s) URL would silently drop the
// signature from generated PDFs. This module is the single place that describes
// that contract.
//
// CONSEQUENCE: these values are IMAGE payloads, not short text, so they must
// never be run through the generic MAX_STRING (1000) short-text cap that guards
// the other company fields. They are bounded separately, below.
//
// This module is deliberately dependency-free (it imports nothing) so that both
// the document services and the company-profile service can use it. Each caller
// raises its own error type: the document services map a failure to
// ValidationError, updateBusinessForMember maps it to ProfileValidationError.
// Both are HTTP 400. (business-service cannot import from api-error directly -
// api-error already imports business-service.)

/**
 * Ceiling for ONE inline image data URL, measured in characters of base64 text.
 *
 * Derived from the app's own image pipeline rather than invented:
 *   - src/lib/image-orientation.ts rescales any uploaded logo so its long side
 *     is at most MAX_EDGE = 2048px before re-encoding it as PNG or JPEG q0.92;
 *   - the signature canvas is 640x220 (SignatureCanvasModal CANVAS_WIDTH/HEIGHT).
 *
 * A 2048px logo re-encoded as PNG or JPEG q0.92 fits comfortably inside 2 MiB of
 * base64 text, and the largest signature actually stored by the app is ~137 KB
 * (~140k characters). 2 MiB is therefore roughly 15x headroom over real data:
 * generous enough that no legitimate signature or logo is ever rejected, while
 * still preventing an unbounded blob from being written into the company-profile
 * JSON or copied into every document snapshot.
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 2 * 1024 * 1024; // 2 MiB of base64 text

/**
 * The image formats the PDF renderers can embed, with a well-formed base64
 * body. Mirrors the accept set of embedDataUrlImage() and additionally requires
 * the body to actually be base64, so an arbitrary string or a normal http(s)
 * URL is rejected instead of being stored and then silently ignored at render
 * time. Whitespace is tolerated inside the body because the renderer's `atob`
 * ignores it; the value itself is never rewritten.
 */
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=\s]+$/;

/** True when `value` is an inline image data URL the renderers can embed. */
export function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE_DATA_URL.test(value);
}

export interface ImageDataUrlCheck {
  /**
   * The trimmed data URL, returned UNCHANGED apart from surrounding
   * whitespace - never truncated, never rewritten into a non-data URL, never
   * converted to a storage URL. `undefined` means "absent or cleared", which
   * lets callers keep their existing omit/clear semantics.
   */
  value?: string;
  /** Human-readable reason the value was rejected. Undefined when valid. */
  error?: string;
}

/**
 * Check an inline image data URL. A missing/blank value is not an error - it
 * resolves to `{ value: undefined }` so the caller can omit the field or clear
 * it, exactly as before.
 */
export function checkImageDataUrl(value: unknown): ImageDataUrlCheck {
  if (value === undefined || value === null) return {};
  if (typeof value !== "string") {
    return { error: "must be an image data URL string" };
  }
  const s = value.trim();
  if (!s) return {};
  if (s.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return {
      error: `is too large (maximum ${MAX_IMAGE_DATA_URL_LENGTH} characters)`,
    };
  }
  if (!IMAGE_DATA_URL.test(s)) {
    return {
      error:
        "must be a base64 image data URL (data:image/png;base64,... or data:image/jpeg;base64,...)",
    };
  }
  return { value: s };
}
