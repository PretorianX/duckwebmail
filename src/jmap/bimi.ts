/**
 * BIMI (Brand Indicators for Message Identification) utilities
 * Fetches BIMI logos from DNS records via server API
 */

interface BimiCacheEntry {
  logoUrl: string | null;
  fetchedAtMs: number;
}

const bimiCache = new Map<string, BimiCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function normalizeBimiDomainKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Prefer extracting from "Name <local@domain>".
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const addrOrDomain = (angleMatch?.[1] ?? trimmed).trim();

  // If it's an email address, extract domain part; otherwise treat as domain.
  const atIndex = addrOrDomain.lastIndexOf("@");
  const rawDomain = (atIndex >= 0 ? addrOrDomain.slice(atIndex + 1) : addrOrDomain).trim();
  if (!rawDomain) return null;

  // Strip common surrounding punctuation/whitespace.
  const domain = rawDomain.replace(/^[<\s]+|[>\s,;:]+$/g, "").toLowerCase();
  return domain || null;
}

export async function fetchBimiLogo(emailOrDomain: string): Promise<string | null> {
  const domain = normalizeBimiDomainKey(emailOrDomain);
  if (!domain) return null;

  const cacheKey = domain;
  const cached = bimiCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
    return cached.logoUrl;
  }

  try {
    const response = await fetch(`/api/bimi?domain=${encodeURIComponent(domain)}`);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { logoUrl: string | null };
    const logoUrl = data.logoUrl || null;
    bimiCache.set(cacheKey, { logoUrl, fetchedAtMs: Date.now() });
    return logoUrl;
  } catch {
    // Cache null result to avoid repeated failed requests
    bimiCache.set(cacheKey, { logoUrl: null, fetchedAtMs: Date.now() });
    return null;
  }
}

