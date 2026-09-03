// Strict, centralized field validation shared across the app. All input from
// the user is treated as untrusted: validators reject dangerous HTML/script and
// unsafe values, normalize code fields to uppercase, and emit specific,
// user-friendly messages. These contracts are shared so a future backend can
// reuse the exact same rules. NOTE: frontend validation improves UX only; it is
// not a substitute for server-side enforcement.

import { INDIAN_STATES } from "./india";

export interface FieldRule {
  validate: (value: string) => string | null; // null = valid; string = error message
}

// ---- core reusable validators -------------------------------------------------

export const required = (label: string) => (value: string): string | null =>
  value.trim() ? null : `${label} is required.`;

const stripHtml = (value: string): string =>
  value.replace(/<[^>]*>|<\/[^>]*>/g, "");

const hasDangerousContent = (value: string): boolean => {
  const v = value.toLowerCase();
  return (
    /<script[\s>]/i.test(value) ||
    /<img[^>]*onerror/i.test(value) ||
    /<svg[^>]*onload/i.test(value) ||
    /onerror=|onclick=|onload=|javascript:/i.test(v) ||
    /src\s*=\s*["']\s*(javascript:|data:text\/html)/i.test(v)
  );
};

export const noInjection = (label: string) => (value: string): string | null => {
  if (hasDangerousContent(value)) {
    return `${label} contains content that is not permitted.`;
  }
  return null;
};

// Uppercases code fields (invoice prefix, GSTIN, PAN, HSN/SAC, vehicle number,
// state code). Prose keeps its natural capitalization unless it was typed in
// mixed case — see normalizeProse.
export const normalizeCode = (value: string): string => value.trim().toUpperCase();
export const normalizeProse = (value: string): string => value.trim().replace(/\s+/g, " ");

// ---- plan-agnostic helpers for building rich validators -----------------------

export function validateName(label: string): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return `${label} is required.`;
      if (noInjection(label)(v)) return noInjection(label)(v);
      if (v.length > 200) return `${label} must be 200 characters or fewer.`;
      return null;
    },
  };
}

export function validateText(label: string, max = 1000): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (noInjection(label)(v)) return noInjection(label)(v);
      if (v.length > max) return `${label} must be ${max} characters or fewer.`;
      return null;
    },
  };
}

export function validateInvoicePrefix(): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return "Invoice prefix is required.";
      if (!/^[A-Za-z0-9-]+$/.test(v)) {
        return "Invoice prefix may contain only letters, numbers and hyphens.";
      }
      if (v.length > 12) return "Invoice prefix must be 12 characters or fewer.";
      return null;
    },
  };
}

export function validateGstin(): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim().toUpperCase();
      if (!v) return "GSTIN is required.";
      if (!/^[0-9A-Z]{15}$/.test(v)) {
        return "GSTIN must contain exactly 15 characters (alphanumeric).";
      }
      // First two characters are the state code (numeric 01–37).
      const stateCode = v.slice(0, 2);
      const known = INDIAN_STATES.map((s) => s.code);
      if (known.length && !known.includes(stateCode) && stateCode !== "97" && stateCode !== "99") {
        return "GSTIN must begin with a valid 2-digit state code.";
      }
      return null;
    },
  };
}

export function validatePan(): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim().toUpperCase();
      if (!v) return "PAN is required.";
      if (!/^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]{1}$/.test(v)) {
        return "PAN format is invalid (e.g. ABCDE1234F).";
      }
      return null;
    },
  };
}

export function validatePhone(label = "Phone"): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim().replace(/\s+/g, "");
      if (!v) return `${label} is required.`;
      if (!/^(?:\+91|91)?[6-9][0-9]{9}$/.test(v)) {
        return `${label} must be a valid 10-digit Indian mobile number.`;
      }
      return null;
    },
  };
}

export function validateEmail(optional = false): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return optional ? null : "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return "Enter a valid email address.";
      }
      return null;
    },
  };
}

export function validateState(label = "State"): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return `${label} is required.`;
      const exact = INDIAN_STATES.some(
        (s) => s.name === v || `${s.name} (${s.code})` === v
      );
      if (exact) return null;
      // Reject common informal forms: "TN", "Tamilnadu", "Tamil Nadu (33)".
      return `${label} must be selected from the official Indian states list (e.g. "Tamil Nadu").`;
    },
  };
}

export function validateCity(): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return "City is required.";
      if (!/^[A-Za-z][A-Za-z .'-]{1,60}$/.test(v)) {
        return "City may contain only letters, spaces, dots, apostrophes and hyphens.";
      }
      return null;
    },
  };
}

export function validatePincode(optional = false): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return optional ? null : "PIN code is required.";
      if (!/^[1-9][0-9]{5}$/.test(v)) return "PIN code must be a 6-digit number.";
      return null;
    },
  };
}

export function validateHsnSAC(optional = false): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim();
      if (!v) return optional ? null : "HSN/SAC code is required.";
      if (!/^\d{2,8}$/.test(v)) {
        return "HSN/SAC code must be 2 to 8 digits (numeric).";
      }
      return null;
    },
  };
}

export function validatePrice(): FieldRule {
  return {
    validate: (value) => {
      const n = Number(value);
      if (value.trim() === "" || Number.isNaN(n)) return "Price is required.";
      if (n < 0) return "Price cannot be negative.";
      if (n > 1_000_000_000) return "Price is too large.";
      return null;
    },
  };
}

export function validateQuantity(): FieldRule {
  return {
    validate: (value) => {
      const n = Number(value);
      if (value.trim() === "" || Number.isNaN(n)) return "Quantity is required.";
      if (n < 0) return "Quantity cannot be negative.";
      if (n > 1_000_000_000) return "Quantity is too large.";
      return null;
    },
  };
}

export function validateGstRate(): FieldRule {
  return {
    validate: (value) => {
      const n = Number(value);
      if (value.trim() === "" || Number.isNaN(n)) return "GST rate is required.";
      if (![0, 0.25, 3, 5, 12, 18, 28].includes(n)) {
        return "GST rate must be one of 0%, 0.25%, 3%, 5%, 12%, 18% or 28%.";
      }
      return null;
    },
  };
}

export function validateVehicleNumber(optional = false): FieldRule {
  return {
    validate: (value) => {
      const v = value.trim().toUpperCase();
      if (!v) return optional ? null : "Vehicle number is required.";
      if (!/^[A-Z]{2}\s?[0-9]{1,2}\s?[A-Z]{1,3}\s?[0-9]{4}$/.test(v)) {
        return "Vehicle number format is invalid (e.g. TN 01 AB 1234).";
      }
      return null;
    },
  };
}

// ---- combined validators -----------------------------------------------------

export function validateBusinessListingForm(values: {
  companyName: string;
  streetAddress: string;
  city: string;
  state: string;
  pincode: string;
  ownerName: string;
  primaryPhone: string;
  description: string;
}): Record<string, string> {
  const raw: [string, string | null][] = [
    ["companyName", validateName("Business name").validate(values.companyName)],
    ["streetAddress", validateText("Street address", 300).validate(values.streetAddress)],
    ["city", validateCity().validate(values.city)],
    ["state", validateState().validate(values.state)],
    ["pincode", validatePincode().validate(values.pincode)],
    ["ownerName", validateName("Owner name").validate(values.ownerName)],
    ["primaryPhone", validatePhone("Phone").validate(values.primaryPhone)],
    ["description", validateText("Description", 1000).validate(values.description)],
  ];
  return Object.fromEntries(
    raw.filter(([, msg]) => msg != null)
  ) as Record<string, string>;
}

export function validateCompanyProfileForm(values: {
  name: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  streetAddress: string;
  pincode: string;
  invoicePrefix: string;
}): Record<string, string> {
  const raw: [string, string | null][] = [
    ["name", validateName("Business name").validate(values.name)],
    ["gstin", validateGstin().validate(values.gstin)],
    ["pan", validatePan().validate(values.pan)],
    ["email", validateEmail().validate(values.email)],
    ["phone", validatePhone("Phone").validate(values.phone)],
    ["state", validateState().validate(values.state)],
    ["city", validateCity().validate(values.city)],
    ["streetAddress", validateText("Street address", 300).validate(values.streetAddress)],
    ["pincode", validatePincode().validate(values.pincode)],
    ["invoicePrefix", validateInvoicePrefix().validate(values.invoicePrefix)],
  ];
  return Object.fromEntries(
    raw.filter(([, msg]) => msg != null)
  ) as Record<string, string>;
}