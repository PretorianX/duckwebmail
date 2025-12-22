export type ExtractedAttachmentRef = {
  /** Stable id for React keys (derived from blobId/partId/cid). */
  id: string;
  blobId: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  disposition: "attachment" | "inline";
  cid?: string;
};

type BodyPart = {
  partId?: string;
  blobId?: string;
  size?: number;
  name?: string;
  type?: string;
  disposition?: string;
  cid?: string;
  subParts?: BodyPart[];
};

function normalizeDisposition(value: unknown): "attachment" | "inline" | null {
  if (typeof value !== "string") return null;
  const d = value.trim().toLowerCase();
  if (d === "attachment") return "attachment";
  if (d === "inline") return "inline";
  return null;
}

function normalizeType(value: unknown): string {
  const t = typeof value === "string" ? value.trim() : "";
  return t || "application/octet-stream";
}

function normalizeName(value: unknown, fallback: string): string {
  const n = typeof value === "string" ? value.trim() : "";
  return n || fallback;
}

function guessExtension(contentType: string): string | null {
  const t = contentType.toLowerCase();
  if (t === "message/rfc822" || t === "application/rfc822") return "eml";
  if (t === "application/pdf") return "pdf";
  if (t === "application/zip") return "zip";
  if (t === "application/json") return "json";
  if (t === "text/plain") return "txt";
  if (t === "text/html") return "html";
  if (t.startsWith("image/")) return t.split("/")[1] || "img";
  return null;
}

function shortId(value: string): string {
  const s = value.trim();
  return s.length <= 8 ? s : s.slice(0, 8);
}

function normalizeCid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cid = value.trim().replace(/^<|>$/g, "");
  return cid || undefined;
}

function isMultipart(type: string): boolean {
  return type.toLowerCase().startsWith("multipart/");
}

function isRfc822(type: string): boolean {
  const t = type.toLowerCase();
  return t === "message/rfc822" || t === "application/rfc822";
}

function isInternalMessagePart(type: string): boolean {
  const t = type.toLowerCase();
  if (!t.startsWith("message/")) return false;
  // Keep RFC822 attachments; everything else is usually transport/report metadata.
  if (isRfc822(t)) return false;
  return true;
}

function looksLikeBodyPart(part: BodyPart): boolean {
  const type = normalizeType(part.type);
  // Heuristic: if it's a plain body part (no name, no disposition, text/*), ignore it.
  const disp = normalizeDisposition(part.disposition);
  const hasName = typeof part.name === "string" && part.name.trim() !== "";
  if (!hasName && !disp && type.toLowerCase().startsWith("text/")) return true;
  return false;
}

/**
 * Extract attachments and inline images from a JMAP Email bodyStructure tree.
 *
 * Rules:
 * - Only leaf parts with `blobId` are downloadable.
 * - disposition=attachment => attachment
 * - disposition=inline (+cid or image/*) => inlineImages
 * - If disposition is missing but name exists, treat as attachment (except obvious body text)
 */
export function extractAttachmentsFromBodyStructure(bodyStructure: unknown | undefined): {
  attachments: ExtractedAttachmentRef[];
  inlineImages: ExtractedAttachmentRef[];
} {
  const attachments: ExtractedAttachmentRef[] = [];
  const inlineImages: ExtractedAttachmentRef[] = [];
  let emlCounter = 0;

  const walk = (p: BodyPart | undefined) => {
    if (!p) return;

    const type = normalizeType(p.type);
    const disp = normalizeDisposition(p.disposition);
    const cid = normalizeCid(p.cid);

    const hasBlob = typeof p.blobId === "string" && p.blobId.trim() !== "";
    const treatAsOpaque = hasBlob && (disp === "attachment" || isRfc822(type));

    // Container parts
    if (!p.blobId && isMultipart(type)) {
      for (const sp of p.subParts ?? []) walk(sp);
      return;
    }

    // If this is an opaque attachment, do NOT recurse into subParts (prevents duplicates
    // for message/rfc822 where servers may also expose inner parts).
    if (!treatAsOpaque) {
      // Recurse if needed (some servers may still nest parts even with blobId absent)
      for (const sp of p.subParts ?? []) walk(sp);
    }

    // Only downloadable parts
    if (!hasBlob) return;
    const blobId = (p.blobId as string).trim();

    // Ignore obvious message body parts (avoid showing HTML/text body as an “attachment”).
    if (looksLikeBodyPart(p)) return;

    // Ignore internal message/* parts (e.g. message/delivery-status) unless explicitly presented as an attachment.
    // This avoids DSN/report emails showing multiple pseudo-attachments.
    const hasProvidedName = typeof p.name === "string" && p.name.trim() !== "";
    if (isInternalMessagePart(type) && disp !== "attachment" && !hasProvidedName) return;

    const sizeBytes = typeof p.size === "number" && Number.isFinite(p.size) ? Math.max(0, Math.trunc(p.size)) : 0;
    const ext = guessExtension(type);
    const base = type.toLowerCase().startsWith("image/") ? "image" : "attachment";
    const fallbackName = ext ? `${base}-${shortId(blobId)}.${ext}` : `${base}-${shortId(blobId)}`;
    const name = hasProvidedName
      ? normalizeName(p.name, fallbackName)
      : isRfc822(type)
        ? `eml-${(emlCounter += 1)}.eml`
        : fallbackName;

    const entry: ExtractedAttachmentRef = {
      id: (typeof p.partId === "string" && p.partId.trim()) ? p.partId.trim() : cid ? `cid:${cid}` : blobId,
      blobId,
      name,
      sizeBytes,
      contentType: type,
      disposition: disp === "inline" ? "inline" : "attachment",
      ...(cid ? { cid } : {})
    };

    // Inline images: prefer explicit inline disposition or cid presence.
    if ((disp === "inline" || !!cid) && (cid || type.toLowerCase().startsWith("image/"))) {
      inlineImages.push(entry);
      return;
    }

    // Everything else: include as attachment so users can always download it.
    attachments.push({ ...entry, disposition: "attachment" });
  };

  walk(bodyStructure as BodyPart | undefined);

  return { attachments, inlineImages };
}


