import { getDomain, parse } from "tldts";

/**
 * Registrable domain (eTLD+1) for a hostname, lowercase. Returns null when the
 * input is not a plausible hostname. "medicare.gov.evil.com" -> "evil.com".
 */
export function registrableDomain(host: string): string | null {
  const cleaned = host.trim().toLowerCase();
  if (!cleaned || /\s/.test(cleaned)) return null;
  const domain = getDomain(cleaned, { allowPrivateDomains: false });
  if (!domain) return null;
  const parsed = parse(cleaned);
  if (!parsed.isIcann && !parsed.isPrivate) return null;
  return domain;
}

/** Registrable domain of an email address; accepts "Name <addr>" too. */
export function emailDomain(address: string): string | null {
  const m = address.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (!m) return null;
  return registrableDomain(m[1]);
}

/** Registrable domain of a URL; scheme optional; null for mailto/tel/invalid. */
export function urlDomain(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(mailto|tel|sms|javascript):/i.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname;
    return registrableDomain(host);
  } catch {
    return null;
  }
}

/** Hostname of a URL or email address (lowercase), or null. */
export function hostOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const email = trimmed.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (email) return email[1].toLowerCase();
  if (/^(mailto|tel|sms|javascript):/i.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when the host IS an official domain or a subdomain of one, on a label boundary.
 * "mail.medicare.gov" matches "medicare.gov"; "medicare.gov.evil.com" and "evilmedicare.gov" do not.
 * Works for multi-label official domains such as "dmv.ca.gov".
 */
export function hostMatchesAny(host: string, officialDomains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return officialDomains.some((d) => {
    const od = d.toLowerCase();
    return h === od || h.endsWith(`.${od}`);
  });
}
