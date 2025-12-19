import { findResponse, generateCallId, isErrorResponse, jmapRequest, type JmapMethodResponse } from "./client";
import { JMAP_CORE, JMAP_MAIL } from "./mailbox";

export interface JmapEmailAddress {
  name?: string | null;
  email: string;
}

export interface JmapEmailBodyValue {
  value: string;
  isTruncated?: boolean;
  isEncodingProblem?: boolean;
}

export interface JmapEmailBodyPart {
  partId: string;
  blobId?: string;
  size?: number;
  name?: string;
  type?: string;
  charset?: string;
  disposition?: string;
  cid?: string;
  subParts?: JmapEmailBodyPart[];
}

export interface JmapEmailSummary {
  id: string;
  /**
   * Blob id of the whole message in RFC822 form.
   * Can be used with the JMAP download URL template to download `.eml`.
   */
  blobId?: string;
  subject?: string;
  from?: JmapEmailAddress[];
  to?: JmapEmailAddress[];
  receivedAt?: string;
  preview?: string;
  keywords?: Record<string, boolean>;
  hasAttachment?: boolean;
}

export interface JmapEmailFull extends JmapEmailSummary {
  htmlBody?: JmapEmailBodyPart[];
  textBody?: JmapEmailBodyPart[];
  bodyValues?: Record<string, JmapEmailBodyValue>;
  bodyStructure?: JmapEmailBodyPart;
}

interface EmailQueryResponse {
  accountId: string;
  queryState?: string;
  canCalculateChanges?: boolean;
  ids: string[];
  position?: number;
  total?: number;
}

interface EmailGetResponse<TEmail = JmapEmailSummary> {
  accountId: string;
  state?: string;
  list: TEmail[];
  notFound?: string[];
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

function assertEmailQueryResponse(value: unknown): EmailQueryResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JMAP response: Email/query payload is not an object");
  }
  const v = value as Partial<EmailQueryResponse>;
  if (!Array.isArray(v.ids)) {
    throw new Error("Invalid JMAP response: Email/query missing ids");
  }
  return v as EmailQueryResponse;
}

function assertEmailGetResponse<TEmail>(value: unknown): EmailGetResponse<TEmail> {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid JMAP response: Email/get payload is not an object");
  }
  const v = value as Partial<EmailGetResponse<TEmail>>;
  if (!Array.isArray(v.list)) {
    throw new Error("Invalid JMAP response: Email/get missing list");
  }
  return v as EmailGetResponse<TEmail>;
}

type ListCacheEntry = {
  mailboxesKey: string;
  queryState?: string;
  total?: number;
  emails: JmapEmailSummary[];
  fetchedAtMs: number;
};

const emailListCache = new Map<string, ListCacheEntry>();

type BodyCacheEntry = {
  key: string;
  html?: string;
  text?: string;
  bodyStructure?: JmapEmailBodyPart;
  fetchedAtMs: number;
};

const emailBodyCache = new Map<string, BodyCacheEntry>();

/**
 * Build the JMAP filter object for Email/query.
 * - If no search query is provided, just filter by mailbox.
 * - If a search query is provided, use `text` for full-text search (most reliable).
 */
function buildEmailQueryFilter(mailboxId: string, query?: string, _includeBody?: boolean): Record<string, unknown> {
  const trimmedQuery = (query ?? "").trim();
  if (trimmedQuery === "") {
    return { inMailbox: mailboxId };
  }

  // Use `text` for FTS - searches headers and body
  return {
    operator: "AND",
    conditions: [
      { inMailbox: mailboxId },
      { text: trimmedQuery }
    ]
  };
}

export async function listEmailSummariesInMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  mailboxId: string;
  limit?: number;
  force?: boolean;
  /** Optional search query to filter by from/to/subject (and optionally body). */
  query?: string;
  /** If true, also search message body text. */
  includeBody?: boolean;
}): Promise<{ emails: JmapEmailSummary[]; total?: number; queryState?: string }> {
  const limit = params.limit ?? 50;
  const normalizedQuery = (params.query ?? "").trim().toLowerCase();
  const bodyFlag = params.includeBody ? 1 : 0;
  const cacheKey = `${params.apiUrl}|${params.accountId}|${params.mailboxId}|${limit}|q=${normalizedQuery}|body=${bodyFlag}`;

  if (!params.force) {
    const cached = emailListCache.get(cacheKey);
    if (cached) return { emails: cached.emails, total: cached.total, queryState: cached.queryState };
  }

  const queryCallId = generateCallId("emlq");
  const getCallId = generateCallId("emlg");

  const filter = buildEmailQueryFilter(params.mailboxId, params.query, params.includeBody);

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/query",
      {
        accountId: params.accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        position: 0,
        limit
      },
      queryCallId
    ],
    [
      "Email/get",
      {
        accountId: params.accountId,
        properties: ["id", "blobId", "subject", "from", "to", "receivedAt", "preview", "keywords", "hasAttachment"],
        "#ids": { resultOf: queryCallId, name: "Email/query", path: "/ids" }
      },
      getCallId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Email listing failed: ${errText}`);

  const queryPayload = findResponse(res.methodResponses, queryCallId);
  if (!queryPayload) throw new Error("Email/query failed: missing response payload");
  const query = assertEmailQueryResponse(queryPayload);

  const getPayload = findResponse(res.methodResponses, getCallId);
  if (!getPayload) throw new Error("Email/get failed: missing response payload");
  const get = assertEmailGetResponse<JmapEmailSummary>(getPayload);

  emailListCache.set(cacheKey, {
    mailboxesKey: `${params.apiUrl}|${params.accountId}|${params.mailboxId}`,
    queryState: query.queryState,
    total: query.total,
    emails: get.list,
    fetchedAtMs: Date.now()
  });

  return { emails: get.list, total: query.total, queryState: query.queryState };
}

function pickFirstBodyValue(email: JmapEmailFull): { html?: string; text?: string } {
  const values = email.bodyValues ?? {};
  const htmlPartId = email.htmlBody?.[0]?.partId;
  const textPartId = email.textBody?.[0]?.partId;

  const html = htmlPartId ? values[htmlPartId]?.value : undefined;
  const text = textPartId ? values[textPartId]?.value : undefined;

  return { html, text };
}

export async function getEmailBody(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  emailId: string;
  force?: boolean;
}): Promise<{ html?: string; text?: string; bodyStructure?: JmapEmailBodyPart }> {
  const cacheKey = `${params.apiUrl}|${params.accountId}|${params.emailId}`;

  if (!params.force) {
    const cached = emailBodyCache.get(cacheKey);
    if (cached) return { html: cached.html, text: cached.text, bodyStructure: cached.bodyStructure };
  }

  const callId = generateCallId("body");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/get",
      {
        accountId: params.accountId,
        ids: [params.emailId],
        properties: ["id", "htmlBody", "textBody", "bodyValues", "bodyStructure"],
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
        maxBodyValueBytes: 1024 * 512
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Email body load failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId);
  if (!payload) throw new Error("Email/get failed: missing response payload");
  const parsed = assertEmailGetResponse<JmapEmailFull>(payload);
  const email = parsed.list[0];
  if (!email) throw new Error("Email/get returned no email");

  const body = pickFirstBodyValue(email);
  const out = { ...body, bodyStructure: email.bodyStructure };
  emailBodyCache.set(cacheKey, { key: cacheKey, html: body.html, text: body.text, bodyStructure: email.bodyStructure, fetchedAtMs: Date.now() });
  return out;
}

export function formatAddressList(value: JmapEmailAddress[] | undefined): string {
  if (!value || value.length === 0) return "";
  return value
    .map((a) => {
      const name = (a.name ?? "").trim();
      const email = (a.email ?? "").trim();
      if (name && email) return `${name} <${email}>`;
      return email || name;
    })
    .filter((s) => s.trim().length > 0)
    .join(", ");
}

export function isUnread(keywords: Record<string, boolean> | undefined): boolean {
  // JMAP: $seen means "read".
  return !(keywords && keywords["$seen"] === true);
}

export function isStarred(keywords: Record<string, boolean> | undefined): boolean {
  return !!(keywords && keywords["$flagged"] === true);
}

type KeywordValue = boolean | null;

/**
 * Mark an email as read by setting the $seen keyword.
 * Returns true if the update succeeded.
 */
export async function markEmailAsRead(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  emailId: string;
}): Promise<boolean> {
  const callId = generateCallId("seen");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/set",
      {
        accountId: params.accountId,
        update: {
          [params.emailId]: {
            "keywords/$seen": true
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) {
    console.error("[JMAP] markEmailAsRead failed:", errText);
    return false;
  }

  return true;
}

/**
 * Mark an email as unread by removing the $seen keyword.
 * Returns true if the update succeeded.
 */
export async function markEmailAsUnread(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  emailId: string;
}): Promise<boolean> {
  const callId = generateCallId("unseen");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/set",
      {
        accountId: params.accountId,
        update: {
          [params.emailId]: {
            // PatchObject: set to null to remove the keyword key from the map.
            "keywords/$seen": null as KeywordValue
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) {
    console.error("[JMAP] markEmailAsUnread failed:", errText);
    return false;
  }

  return true;
}

/**
 * Set/unset $flagged keyword (star).
 * Returns true if the update succeeded.
 */
export async function setEmailStarred(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  emailId: string;
  starred: boolean;
}): Promise<boolean> {
  const callId = generateCallId("flag");
  const keywordPatch: KeywordValue = params.starred ? true : null;
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/set",
      {
        accountId: params.accountId,
        update: {
          [params.emailId]: {
            "keywords/$flagged": keywordPatch
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) {
    console.error("[JMAP] setEmailStarred failed:", errText);
    return false;
  }

  return true;
}

/**
 * Permanently delete an email by destroying it.
 * Returns true if the destroy succeeded.
 */
export async function destroyEmail(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  emailId: string;
}): Promise<boolean> {
  const callId = generateCallId("edel");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/set",
      {
        accountId: params.accountId,
        destroy: [params.emailId]
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) {
    console.error("[JMAP] destroyEmail failed:", errText);
    return false;
  }

  return true;
}

type MailboxIdPatchValue = boolean | null;

/**
 * Move an email from one mailbox to another (remove from "fromMailboxId", add to "toMailboxId").
 *
 * Note: JMAP allows an Email to be in multiple mailboxes. This function performs a "move"
 * semantics (remove from source, add to destination).
 */
export async function moveEmailToMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  emailId: string;
  fromMailboxId: string;
  toMailboxId: string;
}): Promise<void> {
  if (params.fromMailboxId === params.toMailboxId) return;

  const callId = generateCallId("emlmove");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/set",
      {
        accountId: params.accountId,
        update: {
          [params.emailId]: {
            // PatchObject: set to null to remove mailboxIds key from the map.
            [`mailboxIds/${params.fromMailboxId}`]: null as MailboxIdPatchValue,
            [`mailboxIds/${params.toMailboxId}`]: true as MailboxIdPatchValue
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Move email failed: ${errText}`);

  // Ensure subsequent list loads are fresh (push may arrive later / not at all on some servers).
  clearEmailListCacheForAccount({ apiUrl: params.apiUrl, accountId: params.accountId });
}

/**
 * Clear the email list cache (e.g. when a StateChange is received).
 */
export function clearEmailListCache(): void {
  emailListCache.clear();
}

export function clearEmailListCacheForAccount(params: { apiUrl: string; accountId: string }): void {
  const prefix = `${params.apiUrl}|${params.accountId}|`;
  for (const key of emailListCache.keys()) {
    if (key.startsWith(prefix)) emailListCache.delete(key);
  }
}
