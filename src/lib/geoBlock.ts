// EEA/UK geo-block at signup. Per the May-2026 legal review (Q7), Grace Flare
// does not offer service to users in the European Economic Area or the United
// Kingdom in v1, so we don't trigger GDPR Art. 27 representative requirements.
//
// Detection is client-side via api.country.is — a free, no-key IP-geolocation
// service. This is best-effort (VPNs and proxies bypass it), but documents a
// good-faith effort. The block is also surfaced in PrivacyPage § 11 in plain
// text so users can self-identify if detection fails.

const EEA_UK_COUNTRIES = new Set([
  // EU member states
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA-only (non-EU)
  "IS", "LI", "NO",
  // United Kingdom + Crown Dependencies
  "GB", "JE", "GG", "IM",
]);

export function isEeaOrUk(country: string | null | undefined): boolean {
  if (!country) return false;
  return EEA_UK_COUNTRIES.has(country.toUpperCase());
}

export async function fetchCountry(signal?: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch("https://api.country.is/", { signal });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { country?: string };
    return typeof data.country === "string" ? data.country : null;
  } catch {
    return null;
  }
}
