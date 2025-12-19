import { findResponse, generateCallId, isErrorResponse, jmapRequest, type JmapMethodResponse } from "./client";
import { getMailboxes, JMAP_CORE, JMAP_MAIL } from "./mailbox";
import type { JmapSession } from "./normalizeSession";

export const JMAP_SUBMISSION = "urn:ietf:params:jmap:submission";

export type EmailAddress = { name?: string | null; email: string };

export type UploadedBlob = { blobId: string; type?: string; size?: number; name?: string };

export type InlineImage = { cid: string; file: File };

export type Identity = { id: string; name?: string | null; email: string };

type EmailBodyValue = { value: string; isTruncated?: boolean; isEncodingProblem?: boolean };

type EmailBodyPart = {
  // For leaf parts, servers use partId to reference bodyValues.
  // For multipart container parts, some servers (e.g. Stalwart) reject specifying partId/blobId.
  partId?: string;
  blobId?: string;
  size?: number;
  name?: string;
  type?: string;
  charset?: string;
  disposition?: string;
  cid?: string;
  subParts?: EmailBodyPart[];
};

type IdentityGetResponse = {
  accountId: string;
  list: Array<{ id: string; name?: string | null; email: string }>;
};

type IdentitySetResponse = {
  accountId: string;
  created?: Record<string, { id: string }>;
  notCreated?: Record<string, { type: string; description?: string }>;
};

type EmailSetResponse = {
  accountId: string;
  created?: Record<string, { id: string }>;
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
};

type EmailSubmissionSetResponse = {
  accountId: string;
  created?: Record<string, { id: string }>;
  notCreated?: Record<string, { type: string; description?: string }>;
};

function getErrorText(methodResponses: JmapMethodResponse[]): string | null {
  const err = methodResponses.find((r) => isErrorResponse(r));
  if (!err) return null;
  const payload = err[1] ?? {};
  const type = typeof payload === "object" && payload ? String((payload as Record<string, unknown>).type ?? "error") : "error";
  const description =
    typeof payload === "object" && payload ? String((payload as Record<string, unknown>).description ?? "") : "";
  return description ? `${type}: ${description}` : type;
}

function encodeTemplateValue(value: string): string {
  // Encode as a URL component for template substitution.
  return encodeURIComponent(value);
}

export function buildUploadUrl(params: {
  uploadUrlTemplate: string;
  accountId: string;
  type?: string;
  name?: string;
}): string {
  // JMAP session.uploadUrl is a URI template (RFC 6570 Level 1-ish in practice).
  // Stalwart commonly uses placeholders like {accountId}, {name}, {type}.
  let url = params.uploadUrlTemplate;
  url = url.replaceAll("{accountId}", encodeTemplateValue(params.accountId));
  url = url.replaceAll("{type}", encodeTemplateValue(params.type ?? "application/octet-stream"));
  url = url.replaceAll("{name}", encodeTemplateValue(params.name ?? "attachment"));
  return url;
}

export async function uploadBlob(params: {
  session: JmapSession;
  authHeader: string;
  accountId: string;
  file: File;
}): Promise<UploadedBlob> {
  const uploadUrl = buildUploadUrl({
    uploadUrlTemplate: params.session.uploadUrl,
    accountId: params.accountId,
    type: params.file.type || "application/octet-stream",
    name: params.file.name || "attachment"
  });

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: params.authHeader,
      "Content-Type": params.file.type || "application/octet-stream"
    },
    body: params.file
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object") throw new Error("Upload failed: invalid JSON response");
  const blobId = (data as Record<string, unknown>).blobId;
  if (typeof blobId !== "string" || blobId.trim() === "") throw new Error("Upload failed: missing blobId");

  const type = (data as Record<string, unknown>).type;
  const size = (data as Record<string, unknown>).size;
  return {
    blobId,
    type: typeof type === "string" ? type : undefined,
    size: typeof size === "number" ? size : undefined,
    name: params.file.name || undefined
  };
}

export async function getDefaultIdentity(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
}): Promise<Identity> {
  const callId = generateCallId("idn");
  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_SUBMISSION], [
    [
      "Identity/get",
      {
        accountId: params.accountId,
        properties: ["id", "name", "email"]
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Identity/get failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId) as unknown;
  if (!payload || typeof payload !== "object") throw new Error("Identity/get failed: missing response payload");
  const parsed = payload as IdentityGetResponse;
  const first = parsed.list?.[0];
  if (!first || typeof first.id !== "string" || typeof first.email !== "string") {
    throw new Error("Identity/get returned no identities");
  }
  return { id: first.id, name: first.name ?? null, email: first.email };
}

export async function getOrCreateIdentity(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  email: string;
  name?: string | null;
}): Promise<Identity> {
  const normalizedEmail = params.email.trim();
  if (normalizedEmail === "") throw new Error("From address is required");

  // 1) Try to find an existing identity matching the email.
  const getCallId = generateCallId("idn");
  const getRes = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_SUBMISSION], [
    [
      "Identity/get",
      {
        accountId: params.accountId,
        properties: ["id", "name", "email"]
      },
      getCallId
    ]
  ]);

  const getErr = getErrorText(getRes.methodResponses);
  if (getErr) throw new Error(`Identity/get failed: ${getErr}`);

  const getPayload = findResponse(getRes.methodResponses, getCallId) as unknown;
  if (!getPayload || typeof getPayload !== "object") throw new Error("Identity/get failed: missing response payload");
  const parsed = getPayload as IdentityGetResponse;
  const match = (parsed.list ?? []).find((i) => (i.email ?? "").trim().toLowerCase() === normalizedEmail.toLowerCase());
  if (match && typeof match.id === "string") {
    return { id: match.id, name: match.name ?? null, email: match.email };
  }

  // 2) Create one (straightforward setup step for servers that don't pre-provision identities).
  const setCallId = generateCallId("idnset");
  const createId = generateCallId("idncreate");
  const createRes = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_SUBMISSION], [
    [
      "Identity/set",
      {
        accountId: params.accountId,
        create: {
          [createId]: {
            email: normalizedEmail,
            ...(params.name ? { name: params.name } : {})
          }
        }
      },
      setCallId
    ]
  ]);

  const setErr = getErrorText(createRes.methodResponses);
  if (setErr) throw new Error(`Identity/set failed: ${setErr}`);

  const setPayload = findResponse(createRes.methodResponses, setCallId) as unknown;
  if (!setPayload || typeof setPayload !== "object") throw new Error("Identity/set failed: missing response payload");
  const setParsed = setPayload as IdentitySetResponse;
  const notCreated = setParsed.notCreated?.[createId];
  if (notCreated) throw new Error(notCreated.description ? `${notCreated.type}: ${notCreated.description}` : notCreated.type);
  const id = setParsed.created?.[createId]?.id;
  if (!id) throw new Error("Identity/set failed: missing created id");

  return { id, name: params.name ?? null, email: normalizedEmail };
}

export async function getDraftsMailboxId(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
}): Promise<string> {
  const { mailboxes } = await getMailboxes({
    apiUrl: params.apiUrl,
    authHeader: params.authHeader,
    accountId: params.accountId
  });
  const drafts = mailboxes.find((m) => (m.role ?? "").toLowerCase() === "drafts");
  if (drafts?.id) return drafts.id;
  const byName = mailboxes.find((m) => m.name.trim().toLowerCase() === "drafts");
  if (byName?.id) return byName.id;
  throw new Error('No Drafts mailbox found (role "drafts")');
}

export async function getSentMailboxId(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
}): Promise<string> {
  const { mailboxes } = await getMailboxes({
    apiUrl: params.apiUrl,
    authHeader: params.authHeader,
    accountId: params.accountId
  });
  const sent = mailboxes.find((m) => (m.role ?? "").toLowerCase() === "sent");
  if (sent?.id) return sent.id;
  const byName = mailboxes.find((m) => m.name.trim().toLowerCase() === "sent");
  if (byName?.id) return byName.id;
  throw new Error('No Sent mailbox found (role "sent")');
}

export function parseEmailList(input: string): string[] {
  const raw = input
    .split(/[;,]/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // Support very simple "Name <email@x>" by extracting between <> if present.
  const emails = raw.map((token) => {
    const m = token.match(/<([^>]+)>/);
    return (m?.[1] ?? token).trim();
  });

  return emails.filter((e) => e.length > 0);
}

function toAddressList(emails: string[]): EmailAddress[] {
  return emails.map((email) => ({ email }));
}

function normalizeLeafMimeType(mimeType: string | undefined): string {
  const t = (mimeType ?? "").trim();
  if (t === "") return "application/octet-stream";
  // RFC 8621: multipart/* body parts are containers and MUST NOT have blobId/partId.
  // Some browsers report `.mhtml` as `multipart/related`, so treat it as an opaque attachment.
  if (t.toLowerCase().startsWith("multipart/")) return "application/octet-stream";
  return t;
}

function rewriteInlineImagesToCid(html: string, allowedCids: Set<string>): string {
  // We store inline images in the editor as <img src="blob:..." data-cid="...">.
  // For email, rewrite them to <img src="cid:..."> and drop the editor-only attribute.
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const imgs = Array.from(doc.querySelectorAll("img[data-cid]"));
  for (const img of imgs) {
    const cid = img.getAttribute("data-cid") ?? "";
    if (!cid || !allowedCids.has(cid)) continue;
    img.setAttribute("src", `cid:${cid}`);
    img.removeAttribute("data-cid");
  }
  return doc.body.innerHTML;
}

function buildBodyStructure(params: {
  htmlBody: string;
  attachments: UploadedBlob[];
  inlineImages: Array<UploadedBlob & { cid: string }>;
}): { bodyStructure: EmailBodyPart; bodyValues: Record<string, EmailBodyValue> } {
  const htmlPartId = "1";
  // Stalwart validates that you MUST NOT specify a charset when providing a `partId`
  // with inlined `bodyValues` (it considers the charset implicit/derived).
  const allowedInlineCids = new Set(params.inlineImages.map((i) => i.cid).filter(Boolean));
  const htmlBody = allowedInlineCids.size > 0 ? rewriteInlineImagesToCid(params.htmlBody, allowedInlineCids) : (params.htmlBody || "");

  const htmlPart: EmailBodyPart = { partId: htmlPartId, type: "text/html" };
  const bodyValues: Record<string, EmailBodyValue> = { [htmlPartId]: { value: htmlBody } };

  const inlineParts: EmailBodyPart[] = params.inlineImages.map((img) => ({
    blobId: img.blobId,
    type: normalizeLeafMimeType(img.type) || "application/octet-stream",
    name: img.name,
    disposition: "inline",
    cid: img.cid,
    size: img.size
  }));

  const attachmentParts: EmailBodyPart[] = params.attachments.map((a, idx) => ({
    blobId: a.blobId,
    type: normalizeLeafMimeType(a.type) || "application/octet-stream",
    name: a.name,
    disposition: "attachment",
    size: a.size
  }));

  // No inline images and no attachments -> simple HTML part.
  if (inlineParts.length === 0 && attachmentParts.length === 0) {
    return { bodyStructure: htmlPart, bodyValues };
  }

  // Inline images present -> wrap the HTML + inline parts into multipart/related.
  const related: EmailBodyPart =
    inlineParts.length > 0
      ? {
          type: "multipart/related",
          subParts: [htmlPart, ...inlineParts]
        }
      : htmlPart;

  // Attachments present -> wrap everything into multipart/mixed.
  if (attachmentParts.length > 0) {
    return {
      bodyStructure: {
        type: "multipart/mixed",
        subParts: [related, ...attachmentParts]
      },
      bodyValues
    };
  }

  // Inline images only -> multipart/related.
  return { bodyStructure: related, bodyValues };
}

export async function upsertDraftEmail(params: {
  session: JmapSession;
  authHeader: string;
  accountId: string;
  draftsMailboxId: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  htmlBody: string;
  attachments: File[];
  inlineImages?: InlineImage[];
  emailId?: string | null;
}): Promise<{ emailId: string }> {
  const toEmails = parseEmailList(params.to);
  const ccEmails = parseEmailList(params.cc ?? "");
  const bccEmails = parseEmailList(params.bcc ?? "");
  const fromEmail = params.from.trim();
  if (fromEmail === "") throw new Error("From address is required");

  const uploadedInlineImages = await Promise.all(
    (params.inlineImages ?? []).map(async ({ cid, file }) => {
      const uploaded = await uploadBlob({ session: params.session, authHeader: params.authHeader, accountId: params.accountId, file });
      return { ...uploaded, cid };
    })
  );

  const { bodyStructure, bodyValues } = buildBodyStructure({
    htmlBody: params.htmlBody,
    attachments: await Promise.all(
      params.attachments.map((file) =>
        uploadBlob({ session: params.session, authHeader: params.authHeader, accountId: params.accountId, file })
      )
    ),
    inlineImages: uploadedInlineImages
  });

  const from: EmailAddress[] = [{ email: fromEmail }];
  const to: EmailAddress[] = toAddressList(toEmails);
  const cc: EmailAddress[] = toAddressList(ccEmails);
  const bcc: EmailAddress[] = toAddressList(bccEmails);

  const callId = generateCallId("emlset");
  const createId = generateCallId("draft");

  const emailObject = {
    mailboxIds: { [params.draftsMailboxId]: true },
    from,
    to,
    cc,
    bcc,
    subject: params.subject || "",
    bodyStructure,
    bodyValues
  } as const;

  const res = await jmapRequest(params.session.apiUrl, params.authHeader, [JMAP_CORE, JMAP_MAIL], [
    [
      "Email/set",
      {
        accountId: params.accountId,
        ...(params.emailId
          ? { update: { [params.emailId]: emailObject } }
          : {
              create: {
                [createId]: emailObject
              }
            })
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`Email/set failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId) as unknown;
  if (!payload || typeof payload !== "object") throw new Error("Email/set failed: missing response payload");
  const parsed = payload as EmailSetResponse;

  if (params.emailId) {
    const notUpdated = parsed.notUpdated?.[params.emailId];
    if (notUpdated) throw new Error(notUpdated.description ? `${notUpdated.type}: ${notUpdated.description}` : notUpdated.type);
    return { emailId: params.emailId };
  }

  const notCreated = parsed.notCreated?.[createId];
  if (notCreated) throw new Error(notCreated.description ? `${notCreated.type}: ${notCreated.description}` : notCreated.type);

  const emailId = parsed.created?.[createId]?.id;
  if (!emailId) throw new Error("Email/set failed: missing created id");
  return { emailId };
}

export async function sendEmailSubmission(params: {
  apiUrl: string;
  authHeader: string;
  accountId: string;
  identity: Identity;
  emailId: string;
  draftsMailboxId: string;
  sentMailboxId: string;
  to: string;
  cc?: string;
  bcc?: string;
  sendAt?: string | null;
}): Promise<{ submissionId: string }> {
  const rcptTo = parseEmailList(params.to);
  const rcptCc = parseEmailList(params.cc ?? "");
  const rcptBcc = parseEmailList(params.bcc ?? "");
  const allRecipients = [...rcptTo, ...rcptCc, ...rcptBcc];
  if (allRecipients.length === 0) throw new Error("Recipient is required");

  const callId = generateCallId("sub");
  const createId = generateCallId("send");

  const res = await jmapRequest(params.apiUrl, params.authHeader, [JMAP_CORE, JMAP_SUBMISSION], [
    [
      "EmailSubmission/set",
      {
        accountId: params.accountId,
        create: {
          [createId]: {
            emailId: params.emailId,
            identityId: params.identity.id,
            envelope: {
              mailFrom: { email: params.identity.email },
              rcptTo: allRecipients.map((email) => ({ email }))
            },
            ...(params.sendAt ? { sendAt: params.sendAt } : {})
          }
        },
        // On successful submission creation, move the draft into Sent (don't destroy).
        onSuccessUpdateEmail: {
          [`#${createId}`]: {
            [`mailboxIds/${params.draftsMailboxId}`]: null,
            [`mailboxIds/${params.sentMailboxId}`]: true,
            "keywords/$draft": null
          }
        }
      },
      callId
    ]
  ]);

  const errText = getErrorText(res.methodResponses);
  if (errText) throw new Error(`EmailSubmission/set failed: ${errText}`);

  const payload = findResponse(res.methodResponses, callId) as unknown;
  if (!payload || typeof payload !== "object") throw new Error("EmailSubmission/set failed: missing response payload");
  const parsed = payload as EmailSubmissionSetResponse;
  const notCreated = parsed.notCreated?.[createId];
  if (notCreated) throw new Error(notCreated.description ? `${notCreated.type}: ${notCreated.description}` : notCreated.type);
  const submissionId = parsed.created?.[createId]?.id;
  if (!submissionId) throw new Error("EmailSubmission/set failed: missing created id");
  return { submissionId };
}

