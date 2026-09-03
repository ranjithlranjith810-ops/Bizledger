// Centralised Indian states & union territory GST codes used across customer,
// company-profile and invoice forms so the state + numeric code are always in
// sync (e.g. "Tamil Nadu (33)").
export interface IndianState {
  name: string;
  code: string; // verifier digit used within GSTIN (state part)
}

export const INDIAN_STATES: IndianState[] = [
  { name: "Andaman and Nicobar Islands", code: "35" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Arunachal Pradesh", code: "12" },
  { name: "Assam", code: "18" },
  { name: "Bihar", code: "10" },
  { name: "Chandigarh", code: "04" },
  { name: "Chhattisgarh", code: "22" },
  { name: "Dadra and Nagar Haveli and Daman and Diu", code: "26" },
  { name: "Delhi", code: "07" },
  { name: "Goa", code: "30" },
  { name: "Gujarat", code: "24" },
  { name: "Haryana", code: "06" },
  { name: "Himachal Pradesh", code: "02" },
  { name: "Jammu and Kashmir", code: "01" },
  { name: "Jharkhand", code: "20" },
  { name: "Karnataka", code: "29" },
  { name: "Kerala", code: "32" },
  { name: "Ladakh", code: "38" },
  { name: "Lakshadweep", code: "31" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "Maharashtra", code: "27" },
  { name: "Manipur", code: "14" },
  { name: "Meghalaya", code: "17" },
  { name: "Mizoram", code: "15" },
  { name: "Nagaland", code: "13" },
  { name: "Odisha", code: "21" },
  { name: "Puducherry", code: "34" },
  { name: "Punjab", code: "03" },
  { name: "Rajasthan", code: "08" },
  { name: "Sikkim", code: "11" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Telangana", code: "36" },
  { name: "Tripura", code: "16" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Uttarakhand", code: "05" },
  { name: "West Bengal", code: "19" },
  { name: "Other Territory", code: "97" },
];

// Format a state name + its GST code as it prints on invoices: "Tamil Nadu (33)".
export function stateWithCode(stateName: string): string {
  const matched = INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === (stateName || "").trim().toLowerCase()
  );
  if (!matched) return stateName || "";
  return `${matched.name} (${matched.code})`;
}

// Given a previously formatted "Tamil Nadu (33)" or plain "Tamil Nadu", return
// the plain state name (used to seed state selectors).
export function bareStateName(formatted: string): string {
  if (!formatted) return "";
  const noParen = formatted.replace(/\s*\(\d+\)\s*$/, "").trim();
  return noParen;
}
