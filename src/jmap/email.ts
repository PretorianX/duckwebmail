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
}

export interface JmapEmailSummary {
  id: string;
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
  fetchedAtMs: number;
};

const emailBodyCache = new Map<string, BodyCacheEntry>();

export async function listEmailSummariesInMailbox(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  mailboxId: string;
  limit?: number;
  force?: boolean;
}): Promise<{ emails: JmapEmailSummary[]; total?: number; queryState?: string }> {
  const limit = params.limit ?? 50;
  const cacheKey = `${params.apiUrl}|${params.accountId}|${params.mailboxId}|${limit}`;

  if (!params.force) {
    const cached = emailListCache.get(cacheKey);
    if (cached) return { emails: cached.emails, total: cached.total, queryState: cached.queryState };
  }

  const queryCallId = generateCallId("emlq");
  const getCallId = generateCallId("emlg");

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/query",
      {
        accountId: params.accountId,
        filter: { inMailbox: params.mailboxId },
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
        properties: ["id", "subject", "from", "to", "receivedAt", "preview", "keywords", "hasAttachment"],
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
}): Promise<{ html?: string; text?: string }> {
  const cacheKey = `${params.apiUrl}|${params.accountId}|${params.emailId}`;

  if (!params.force) {
    const cached = emailBodyCache.get(cacheKey);
    if (cached) return { html: cached.html, text: cached.text };
  }

  const callId = generateCallId("body");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/get",
      {
        accountId: params.accountId,
        ids: [params.emailId],
        properties: ["id", "htmlBody", "textBody", "bodyValues"],
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
  emailBodyCache.set(cacheKey, { key: cacheKey, html: body.html, text: body.text, fetchedAtMs: Date.now() });
  return body;
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
