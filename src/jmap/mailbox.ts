import { findResponse, generateCallId, isErrorResponse, jmapRequest, type JmapMethodResponse } from "./client";

export const JMAP_CORE = "urn:ietf:params:jmap:core";
export const JMAP_MAIL = "urn:ietf:params:jmap:mail";

export interface JmapMailbox {
  id: string;
  name: string;
  parentId?: string | null;
  role?: string | null;
  sortOrder?: number;
  totalEmails?: number;
  unreadEmails?: number;
}

interface MailboxGetResponse {
  accountId: string;
  state?: string;
  list: JmapMailbox[];
  notFound?: string[];
}

function assertMailboxGetResponse(value: unknown): MailboxGetResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JMAP response: Mailbox/get payload is not an object");
  }
  const v = value as Partial<MailboxGetResponse>;
  if (!Array.isArray(v.list)) {
    throw new Error("Invalid JMAP response: Mailbox/get missing list");
  }
  return v as MailboxGetResponse;
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

type CacheEntry = { sessionState?: string; mailboxes: JmapMailbox[]; fetchedAtMs: number };
const mailboxCache = new Map<string, CacheEntry>();

export async function getMailboxes(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  force?: boolean;
}): Promise<{ mailboxes: JmapMailbox[]; sessionState?: string }> {
  const cacheKey = `${params.apiUrl}|${params.accountId}`;
  if (!params.force) {
    const cached = mailboxCache.get(cacheKey);
    if (cached) return { mailboxes: cached.mailboxes, sessionState: cached.sessionState };
  }

  const callId = generateCallId("mbx");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Mailbox/get",
      {
        accountId: params.accountId,
        properties: ["id", "name", "parentId", "role", "sortOrder", "totalEmails", "unreadEmails"]
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Mailbox/get failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Mailbox/get failed: missing response payload");

  const parsed = assertMailboxGetResponse(payload);
  mailboxCache.set(cacheKey, { mailboxes: parsed.list, sessionState: res.sessionState, fetchedAtMs: Date.now() });
  return { mailboxes: parsed.list, sessionState: res.sessionState };
}

