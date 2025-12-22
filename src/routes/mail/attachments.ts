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

function normalizeCid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cid = value.trim().replace(/^<|>$/g, "");
  return cid || undefined;
}

function isMultipart(type: string): boolean {
  return type.toLowerCase().startsWith("multipart/");
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

  const walk = (p: BodyPart | undefined) => {
    if (!p) return;

    const type = normalizeType(p.type);
    const disp = normalizeDisposition(p.disposition);
    const cid = normalizeCid(p.cid);

    // Container parts
    if (!p.blobId && isMultipart(type)) {
      for (const sp of p.subParts ?? []) walk(sp);
      return;
    }

    // Recurse if needed (some servers may still nest parts even with blobId absent)
    for (const sp of p.subParts ?? []) walk(sp);

    // Only downloadable parts
    if (typeof p.blobId !== "string" || p.blobId.trim() === "") return;
    const blobId = p.blobId.trim();

    // Ignore obvious message body parts (avoid showing HTML/text body as an “attachment”).
    if (looksLikeBodyPart(p)) return;

    const sizeBytes = typeof p.size === "number" && Number.isFinite(p.size) ? Math.max(0, Math.trunc(p.size)) : 0;
    const fallbackName = type.toLowerCase().startsWith("image/") ? "image" : "attachment";
    const name = normalizeName(p.name, fallbackName);

    const entry: ExtractedAttachmentRef = {
      id: (typeof p.partId === "string" && p.partId.trim()) ? p.partId.trim() : cid ? `cid:${cid}` : blobId,
      blobId,
      name,
      sizeBytes,
      contentType: type,
      disposition: disp === "inline" ? "inline" : "attachment",
      ...(cid ? { cid } : {})
    };

    if (disp === "inline" && (cid || type.toLowerCase().startsWith("image/"))) {
      inlineImages.push(entry);
      return;
    }

    if (disp === "attachment") {
      attachments.push(entry);
      return;
    }

    // No disposition: treat named non-body parts as attachments.
    const hasName = typeof p.name === "string" && p.name.trim() !== "";
    if (hasName) attachments.push({ ...entry, disposition: "attachment" });
  };

  walk(bodyStructure as BodyPart | undefined);

  return { attachments, inlineImages };
}


