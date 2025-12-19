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

interface MailboxSetError {
  type: string;
  description?: string;
}

interface MailboxSetResponse {
  accountId: string;
  oldState?: string;
  newState?: string;
  created?: Record<string, { id: string }>;
  updated?: Record<string, unknown>;
  destroyed?: string[];
  notCreated?: Record<string, MailboxSetError>;
  notUpdated?: Record<string, MailboxSetError>;
  notDestroyed?: Record<string, MailboxSetError>;
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

function assertMailboxSetResponse(value: unknown): MailboxSetResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JMAP response: Mailbox/set payload is not an object");
  }
  const v = value as Partial<MailboxSetResponse>;
  if (typeof v.accountId !== "string" || v.accountId.length === 0) {
    throw new Error("Invalid JMAP response: Mailbox/set missing accountId");
  }
  return v as MailboxSetResponse;
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

function cacheKey(apiUrl: string, accountId: string): string {
  return `${apiUrl}|${accountId}`;
}

export async function getMailboxes(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  force?: boolean;
}): Promise<{ mailboxes: JmapMailbox[]; sessionState?: string }> {
  const key = cacheKey(params.apiUrl, params.accountId);
  if (!params.force) {
    const cached = mailboxCache.get(key);
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
  mailboxCache.set(key, { mailboxes: parsed.list, sessionState: res.sessionState, fetchedAtMs: Date.now() });
  return { mailboxes: parsed.list, sessionState: res.sessionState };
}

function mailboxSetErrorToMessage(err: MailboxSetError): string {
  return err.description ? `${err.type}: ${err.description}` : err.type;
}

export async function createMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  name: string;
  parentId?: string | null;
}): Promise<{ mailboxId: string; newState?: string }> {
  const callId = generateCallId("mbxset");
  const createId = generateCallId("create");

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Mailbox/set",
      {
        accountId: params.accountId,
        create: {
          [createId]: {
            name: params.name,
            ...(params.parentId ? { parentId: params.parentId } : {})
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Mailbox/set failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Mailbox/set failed: missing response payload");

  const parsed = assertMailboxSetResponse(payload);
  const notCreated = parsed.notCreated?.[createId];
  if (notCreated) throw new Error(`Create folder failed: ${mailboxSetErrorToMessage(notCreated)}`);

  const mailboxId = parsed.created?.[createId]?.id;
  if (!mailboxId) throw new Error("Create folder failed: missing created id");

  mailboxCache.delete(cacheKey(params.apiUrl, params.accountId));
  return { mailboxId, newState: parsed.newState };
}

export async function renameMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  mailboxId: string;
  name: string;
}): Promise<{ newState?: string }> {
  const callId = generateCallId("mbxset");

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Mailbox/set",
      {
        accountId: params.accountId,
        update: {
          [params.mailboxId]: {
            name: params.name
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Mailbox/set failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Mailbox/set failed: missing response payload");

  const parsed = assertMailboxSetResponse(payload);
  const notUpdated = parsed.notUpdated?.[params.mailboxId];
  if (notUpdated) throw new Error(`Rename folder failed: ${mailboxSetErrorToMessage(notUpdated)}`);

  mailboxCache.delete(cacheKey(params.apiUrl, params.accountId));
  return { newState: parsed.newState };
}

export async function moveMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  mailboxId: string;
  parentId: string | null;
}): Promise<{ newState?: string }> {
  const callId = generateCallId("mbxset");

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Mailbox/set",
      {
        accountId: params.accountId,
        update: {
          [params.mailboxId]: {
            parentId: params.parentId
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Mailbox/set failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Mailbox/set failed: missing response payload");

  const parsed = assertMailboxSetResponse(payload);
  const notUpdated = parsed.notUpdated?.[params.mailboxId];
  if (notUpdated) throw new Error(`Move folder failed: ${mailboxSetErrorToMessage(notUpdated)}`);

  mailboxCache.delete(cacheKey(params.apiUrl, params.accountId));
  return { newState: parsed.newState };
}

export async function deleteMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  mailboxId: string;
}): Promise<{ newState?: string }> {
  const callId = generateCallId("mbxset");

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Mailbox/set",
      {
        accountId: params.accountId,
        destroy: [params.mailboxId]
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Mailbox/set failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Mailbox/set failed: missing response payload");

  const parsed = assertMailboxSetResponse(payload);
  const notDestroyed = parsed.notDestroyed?.[params.mailboxId];
  if (notDestroyed) throw new Error(`Delete folder failed: ${mailboxSetErrorToMessage(notDestroyed)}`);

  mailboxCache.delete(cacheKey(params.apiUrl, params.accountId));
  return { newState: parsed.newState };
}

