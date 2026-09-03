import { dataKey, safeGet, safeSet } from "@/lib/storage";
import type { CompanyProfile } from "@/types";

// ---------------------------------------------------------------------------
// Business signature storage abstraction.
//
// Phase 1 stores the signature image on the account-scoped company profile in
// localStorage (keyed by the active business account). The API surface below is
// deliberately narrow so that a future backend / Supabase Storage migration can
// swap the implementation (file path + `business_signature` row) WITHOUT
// rewriting any invoice component.
//
// Contract:
//   getBusinessSignature(businessId)  -> string | null (image data URL or path)
//   saveBusinessSignature(businessId, image) -> boolean
//   deleteBusinessSignature(businessId) -> void
// ---------------------------------------------------------------------------

const COMPANY_ENTITY = "company";

function readProfile(accountId: string): CompanyProfile | null {
  const raw = safeGet(dataKey(accountId, COMPANY_ENTITY));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CompanyProfile;
  } catch {
    return null;
  }
}

function writeProfile(accountId: string, profile: CompanyProfile): void {
  safeSet(dataKey(accountId, COMPANY_ENTITY), JSON.stringify(profile));
}

/**
 * Returns the saved business signature for the given business/account, or null
 * when none exists. Read path is isolated so invoice/PDF components never need
 * to know where the image lives.
 */
export function getBusinessSignature(accountId: string): string | null {
  if (!accountId) return null;
  return readProfile(accountId)?.digitalSignatureUrl ?? null;
}

/**
 * Persists the signature image for the business/account. Returns true when the
 * write completed (storage available), false otherwise.
 */
export function saveBusinessSignature(
  accountId: string,
  image: string
): boolean {
  if (!accountId || !image) return false;
  const profile = readProfile(accountId) ?? ({} as CompanyProfile);
  profile.digitalSignatureUrl = image;
  writeProfile(accountId, profile);
  return getBusinessSignature(accountId) === image;
}

/**
 * Removes the stored signature for the business/account.
 */
export function deleteBusinessSignature(accountId: string): void {
  if (!accountId) return;
  const profile = readProfile(accountId);
  if (!profile) return;
  profile.digitalSignatureUrl = undefined;
  writeProfile(accountId, profile);
}