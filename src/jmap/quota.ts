import { findResponse, generateCallId, isErrorResponse, jmapRequest, type JmapMethodResponse } from "./client";

export const JMAP_CORE = "urn:ietf:params:jmap:core";
export const JMAP_QUOTA = "urn:ietf:params:jmap:quota";

export interface JmapQuota {
  id: string;
  resourceType: string;
  used: number;
  hardLimit?: number;
  softLimit?: number;
  warnLimit?: number;
  scope: string;
  name?: string;
  description?: string;
}

interface QuotaGetResponse {
  accountId: string;
  state?: string;
  list: JmapQuota[];
  notFound?: string[];
}

function assertQuotaGetResponse(value: unknown): QuotaGetResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JMAP response: Quota/get payload is not an object");
  }
  const v = value as Partial<QuotaGetResponse>;
  if (!Array.isArray(v.list)) {
    throw new Error("Invalid JMAP response: Quota/get missing list");
  }
  return v as QuotaGetResponse;
}

function getErrorText(methodResponses: JmapMethodResponse[]): string | null {
  const err = methodResponses.find((r) => isErrorResponse(r));
  if (!err) return null;
  const payload = err[1] ?? {};
  const type = typeof payload === "object" && payload ? String((payload as Record<string, unknown>).type ?? "error") : "error";
  const description =
    typeof payload === "object" && payload ? String((payload as Record<string, unknown>).description ?? "") : "";
  return description ? `${type}: ${description}` : type;
}

type CacheEntry = { sessionState?: string; quotas: JmapQuota[]; fetchedAtMs: number };
const quotaCache = new Map<string, CacheEntry>();

function cacheKey(apiUrl: string, accountId: string): string {
  return `${apiUrl}|${accountId}`;
}

export async function getQuotas(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  force?: boolean;
}): Promise<{ quotas: JmapQuota[]; sessionState?: string }> {
  const key = cacheKey(params.apiUrl, params.accountId);
  if (!params.force) {
    const cached = quotaCache.get(key);
    if (cached) return { quotas: cached.quotas, sessionState: cached.sessionState };
  }

  const callId = generateCallId("quota");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_QUOTA], [
    [
      "Quota/get",
      {
        accountId: params.accountId,
        ids: null // null means all quotas
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Quota/get failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Quota/get failed: missing response payload");

  const parsed = assertQuotaGetResponse(payload);
  quotaCache.set(key, { quotas: parsed.list, sessionState: res.sessionState, fetchedAtMs: Date.now() });
  return { quotas: parsed.list, sessionState: res.sessionState };
}

/**
 * Format bytes into a human-readable string (e.g., "1.5 GB")
 */
export function formatQuotaBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const display = i === 0 ? `${Math.round(v)}` : `${v.toFixed(v < 10 ? 1 : 0)}`;
  return `${display} ${units[i]}`;
}

/**
 * Calculate usage percentage
 */
export function getQuotaPercentage(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
