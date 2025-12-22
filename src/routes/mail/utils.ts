import {
  formatAddressList,
  isStarred,
  isUnread,
  type JmapEmailSummary
} from "../../jmap/email";
import type { JmapMailbox } from "../../jmap/mailbox";
import type { Folder, Message } from "./types";

/**
 * Sorts mailboxes with the following priority:
 * 1. Inbox always first
 * 2. Role/system folders by fixed priority (drafts, sent, archive, trash, junk/spam)
 * 3. Remaining user folders alphabetically by name
 */
export function sortMailboxes(a: JmapMailbox, b: JmapMailbox): number {
  const rolePriority: Record<string, number> = {
    inbox: 0,
    drafts: 1,
    sent: 2,
    archive: 3,
    trash: 4,
    junk: 5,
    spam: 5
  };

  const roleA = (a.role ?? "").toLowerCase();
  const roleB = (b.role ?? "").toLowerCase();

  const priorityA = rolePriority[roleA] ?? 100;
  const priorityB = rolePriority[roleB] ?? 100;

  if (priorityA !== priorityB) return priorityA - priorityB;

  if (priorityA < 100 && priorityB < 100) {
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  }

  return a.name.localeCompare(b.name);
}

export function toFolder(mbx: JmapMailbox): Folder {
  return {
    id: mbx.id,
    name: mbx.name,
    unread: mbx.unreadEmails ?? 0,
    parentId: mbx.parentId ?? null
  };
}

export function pickDefaultFolderId(mailboxes: JmapMailbox[]): string | null {
  const inbox = mailboxes.find((m) => (m.role ?? "").toLowerCase() === "inbox");
  if (inbox) return inbox.id;
  return mailboxes[0]?.id ?? null;
}

export function toMessage(email: JmapEmailSummary): Message {
  const from = formatAddressList(email.from);
  const to = formatAddressList(email.to);
  const subject = (email.subject ?? "").trim();
  const preview = (email.preview ?? "").trim();
  const receivedAt = email.receivedAt ?? new Date(0).toISOString();

  return {
    id: email.id,
    from: from || "(no sender)",
    fromRaw: email.from,
    to,
    subject: subject || "(no subject)",
    preview,
    receivedAt,
    unread: isUnread(email.keywords),
    starred: isStarred(email.keywords),
    hasAttachments: !!email.hasAttachment,
    attachments: [],
    blobId: (email.blobId ?? "").trim() ? String(email.blobId) : null
  };
}

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const plainTextToHtml = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return `<p>${escapeHtml(trimmed).replaceAll("\n", "<br />")}</p>`;
};

export const toDatetimeLocalValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

export const roundToNextMinutes = (date: Date, stepMinutes: number) => {
  const stepMs = stepMinutes * 60 * 1000;
  const ms = date.getTime();
  return new Date(Math.ceil(ms / stepMs) * stepMs);
};

export const formatListArrivalTime = (receivedAtIso: string) => {
  const receivedAt = new Date(receivedAtIso);
  const now = new Date();
  const isToday =
    receivedAt.getFullYear() === now.getFullYear() &&
    receivedAt.getMonth() === now.getMonth() &&
    receivedAt.getDate() === now.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(receivedAt);
  }

  const sameYear = receivedAt.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    ...(sameYear ? {} : { year: "2-digit" }),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(receivedAt);
};

export const getBimiInitial = (from: string) => {
  const match = from.trim().match(/[A-Za-z]/);
  return (match?.[0] ?? "?").toUpperCase();
};

export function decodeBasicUsername(authHeader: string): string | null {
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("basic ")) return null;
  const encoded = trimmed.slice(6).trim();
  try {
    const decoded = globalThis.atob(encoded);
    const idx = decoded.indexOf(":");
    const user = (idx >= 0 ? decoded.slice(0, idx) : decoded).trim();
    return user || null;
  } catch {
    return null;
  }
}

export const formatBytes = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const display = i === 0 ? `${Math.round(v)}` : `${v.toFixed(v < 10 ? 1 : 0)}`;
  return `${display} ${units[i]}`;
};

export const sanitizeFilename = (value: string) => {
  const trimmed = value.trim();
  const safe = (trimmed || "message").replace(/[/\\?%*:|"<>]/g, "_");
  return safe.length > 180 ? safe.slice(0, 180) : safe;
};

export const buildJmapDownloadUrl = (
  template: string,
  params: { accountId: string; blobId: string; name: string; type: string }
) => {
  return template
    .replaceAll("{accountId}", encodeURIComponent(params.accountId))
    .replaceAll("{blobId}", encodeURIComponent(params.blobId))
    .replaceAll("{name}", encodeURIComponent(params.name))
    .replaceAll("{type}", encodeURIComponent(params.type));
};

export const triggerDownload = (filename: string, contentType: string, content: string) => {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const triggerBlobDownload = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export function buildFolderIndex(folders: Folder[]) {
  const byId = new Map<string, Folder>();
  for (const f of folders) byId.set(f.id, f);

  const childrenByParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const parentKey =
      f.parentId && typeof f.parentId === "string" && byId.has(f.parentId)
        ? (f.parentId as string)
        : null;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(f);
    childrenByParent.set(parentKey, list);
  }

  return { byId, childrenByParent };
}

export function buildFolderOptions(
  childrenByParent: Map<string | null, Folder[]>
): Array<{ id: string; label: string; depth: number }> {
  const out: Array<{ id: string; label: string; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const f of children) {
      out.push({ id: f.id, label: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function computeVisibleFolders(
  query: string,
  folders: Folder[],
  folderIndex: { byId: Map<string, Folder> }
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return { visibleFolderIds: null as Set<string> | null, autoExpandFolderIds: new Set<string>() };
  }

  const matches = new Set<string>();
  for (const f of folders) {
    if (f.name.toLowerCase().includes(normalizedQuery)) matches.add(f.id);
  }

  const visible = new Set<string>();
  const autoExpand = new Set<string>();
  for (const id of matches) {
    visible.add(id);
    let cur: string | null | undefined = folderIndex.byId.get(id)?.parentId ?? null;
    while (cur) {
      visible.add(cur);
      autoExpand.add(cur);
      cur = folderIndex.byId.get(cur)?.parentId ?? null;
    }
  }
  return { visibleFolderIds: visible, autoExpandFolderIds: autoExpand };
}

