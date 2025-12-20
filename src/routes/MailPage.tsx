import { useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";


import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Clock,
  Download,
  FileDown,
  FileText,
  Forward,
  LoaderCircle,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Save,
  Star,
  Trash2,
  X
} from "lucide-react";

import ProfileMenu from "../shared/ProfileMenu";
import SafeEmailViewer from "../shared/SafeEmailViewer";
import ComposeEditor from "../shared/ComposeEditor";
import { useMediaQuery } from "../shared/useMediaQuery";
import { useAuth } from "../auth/AuthContext";
import { getPrimarySubmissionAccountId } from "../jmap/normalizeSession";
import { createMailbox, deleteMailbox, getMailboxes, moveMailbox, renameMailbox, type JmapMailbox } from "../jmap/mailbox";
import { formatQuotaBytes, getQuotas, type JmapQuota } from "../jmap/quota";
import { getDraftsMailboxId, getOrCreateIdentity, getSentMailboxId, sendEmailSubmission, upsertDraftEmail } from "../jmap/compose";
import {
  clearEmailListCacheForAccount,
  destroyEmail,
  formatAddressList,
  getEmailBody,
  isStarred,
  isUnread,
  listEmailSummariesInMailbox,
  moveEmailToMailbox,
  markEmailAsRead,
  markEmailAsUnread,
  setEmailStarred,
  type JmapEmailSummary
} from "../jmap/email";
import { JmapPushClient, stateChangeAffectsAccount, type StateChange } from "../jmap/webSocketPush";
import styles from "./mail.module.css";

const branding = (import.meta.env.VITE_LOGIN_BRANDING as string | undefined)?.trim() || "Duckmail";

type Folder = { id: string; name: string; unread: number; parentId?: string | null };
type Attachment = {
  id: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  content: string;
};
type Message = {
  id: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  attachments: Attachment[];
  blobId: string | null;
  html?: string;
  text?: string;
};

/**
 * Sorts mailboxes with the following priority:
 * 1. Inbox always first
 * 2. Role/system folders by fixed priority (drafts, sent, archive, trash, junk/spam)
 * 3. Remaining user folders alphabetically by name
 */
function sortMailboxes(a: JmapMailbox, b: JmapMailbox): number {
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

  // If both have role priority, sort by that
  if (priorityA !== priorityB) return priorityA - priorityB;

  // If both are system folders with same priority, use sortOrder then name
  if (priorityA < 100 && priorityB < 100) {
    const sa = a.sortOrder ?? 0;
    const sb = b.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  }

  // Both are user folders - sort alphabetically
  return a.name.localeCompare(b.name);
}

function toFolder(mbx: JmapMailbox): Folder {
  return {
    id: mbx.id,
    name: mbx.name,
    unread: mbx.unreadEmails ?? 0,
    parentId: mbx.parentId ?? null
  };
}

function pickDefaultFolderId(mailboxes: JmapMailbox[]): string | null {
  const inbox = mailboxes.find((m) => (m.role ?? "").toLowerCase() === "inbox");
  if (inbox) return inbox.id;
  return mailboxes[0]?.id ?? null;
}

function toMessage(email: JmapEmailSummary): Message {
  const from = formatAddressList(email.from);
  const to = formatAddressList(email.to);
  const subject = (email.subject ?? "").trim();
  const preview = (email.preview ?? "").trim();
  const receivedAt = email.receivedAt ?? new Date(0).toISOString();

  return {
    id: email.id,
    from: from || "(no sender)",
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

type ComposeDraft = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  // HTML (rich-text) body
  body: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const plainTextToHtml = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return `<p>${escapeHtml(trimmed).replaceAll("\n", "<br />")}</p>`;
};

const toDatetimeLocalValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const roundToNextMinutes = (date: Date, stepMinutes: number) => {
  const stepMs = stepMinutes * 60 * 1000;
  const ms = date.getTime();
  return new Date(Math.ceil(ms / stepMs) * stepMs);
};

const formatListArrivalTime = (receivedAtIso: string) => {
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

const getBimiInitial = (from: string) => {
  // Demo BIMI placeholder: use the first letter we can find.
  const match = from.trim().match(/[A-Za-z]/);
  return (match?.[0] ?? "?").toUpperCase();
};

function decodeBasicUsername(authHeader: string): string | null {
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

export default function MailPage() {
  const { activeAuth: auth, activeProfile } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const sendMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const scheduledForInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const rowGroupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollAnchorRef = useRef<{ messageId: string; top: number } | null>(null);
  const [folderId, setFolderId] = useState<string>("");
  // Keep a ref to the current folderId so event callbacks always see the latest value.
  const folderIdRef = useRef(folderId);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => new Set());
  const [folderActionsFolderId, setFolderActionsFolderId] = useState<string | null>(null);
  const [folderUiError, setFolderUiError] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const [draggingEmailId, setDraggingEmailId] = useState<string | null>(null);
  const [draggingEmailFromFolderId, setDraggingEmailFromFolderId] = useState<string | null>(null);
  const [folderOpMode, setFolderOpMode] = useState<"create" | "rename" | "delete" | null>(null);
  const [folderOpTargetId, setFolderOpTargetId] = useState<string | null>(null);
  const [folderOpBusy, setFolderOpBusy] = useState(false);
  const [folderOpError, setFolderOpError] = useState<string | null>(null);
  const [folderOpName, setFolderOpName] = useState("");
  const [folderOpParentId, setFolderOpParentId] = useState<string | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(() => new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeCancelConfirmOpen, setComposeCancelConfirmOpen] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeDraftEmailId, setComposeDraftEmailId] = useState<string | null>(null);
  const [rowActionsMessageId, setRowActionsMessageId] = useState<string | null>(null);
  const [expandedToIds, setExpandedToIds] = useState<Set<string>>(() => new Set());
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({ from: "", to: "", cc: "", bcc: "", subject: "", body: "" });
  const [composeShowCc, setComposeShowCc] = useState(false);
  const [composeShowBcc, setComposeShowBcc] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [inlineImagesByCid, setInlineImagesByCid] = useState<Record<string, File>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesTotal, setMessagesTotal] = useState<number | null>(null);
  const [bodyLoadingIds, setBodyLoadingIds] = useState<Set<string>>(() => new Set());
  const [bodyErrors, setBodyErrors] = useState<Record<string, string>>({});
  const [emailCopied, setEmailCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIncludeBody, setSearchIncludeBody] = useState(false);
  const activeProfileName = activeProfile.name;
  const [canDragFolders, setCanDragFolders] = useState(false);
  const canDragEmails = canDragFolders;

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine) and (hover: hover)");
    const apply = () => setCanDragFolders(media.matches);
    apply();
    const onChange = () => apply();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const [mailboxesLoading, setMailboxesLoading] = useState(false);
  const [mailboxesError, setMailboxesError] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<JmapMailbox[]>([]);
  const mailboxById = useMemo(() => new Map(mailboxes.map((m) => [m.id, m])), [mailboxes]);

  // Quota state
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotas, setQuotas] = useState<JmapQuota[]>([]);

  const loadMailboxes = async (opts?: { force?: boolean }) => {
    if (!auth) return;
    setMailboxesError(null);
    setMailboxesLoading(true);
    try {
      const res = await getMailboxes({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        force: opts?.force
      });
      const sorted = [...res.mailboxes].sort(sortMailboxes);
      setMailboxes(sorted);
    } catch (err) {
      setMailboxesError(err instanceof Error ? err.message : "Failed to load folders");
      setMailboxes([]);
    } finally {
      setMailboxesLoading(false);
    }
  };

  useEffect(() => {
    void loadMailboxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accountId, auth?.authHeader, auth?.session.apiUrl]);

  const loadQuotas = async (opts?: { force?: boolean }) => {
    if (!auth) return;
    setQuotaError(null);
    setQuotaLoading(true);
    try {
      const res = await getQuotas({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        force: opts?.force
      });
      setQuotas(res.quotas);
    } catch (err) {
      // Quota capability may not be available on all servers - silently fail
      console.log("[Quota] Failed to load quotas:", err instanceof Error ? err.message : err);
      setQuotaError(err instanceof Error ? err.message : "Failed to load quotas");
      setQuotas([]);
    } finally {
      setQuotaLoading(false);
    }
  };

  useEffect(() => {
    void loadQuotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accountId, auth?.authHeader, auth?.session.apiUrl]);

  useEffect(() => {
    if (mailboxesLoading) return;
    if (mailboxes.length === 0) return;
    setFolderId((prev) => {
      if (prev && mailboxes.some((m) => m.id === prev)) return prev;
      return pickDefaultFolderId(mailboxes) ?? prev;
    });
  }, [mailboxes, mailboxesLoading]);

  useEffect(() => {
    if (mailboxesLoading) return;
    if (mailboxes.length === 0) return;
    const byRole = (role: string) => mailboxes.find((m) => (m.role ?? "").toLowerCase() === role)?.id ?? null;
    const inboxId = byRole("inbox");
    const archiveId = byRole("archive");
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (inboxId) next.add(inboxId);
      if (archiveId) next.add(archiveId);
      return next;
    });
  }, [mailboxes, mailboxesLoading]);

  const folders: Folder[] = useMemo(() => mailboxes.map(toFolder), [mailboxes]);

  const folderIndex = useMemo(() => {
    // Build a stable tree:
    // - Preserve the server-provided mailbox ordering (we sort mailboxes before mapping to folders).
    // - Treat orphaned folders (parentId missing from the list) as root folders.
    const byId = new Map<string, Folder>();
    for (const f of folders) byId.set(f.id, f);

    const childrenByParent = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const parentKey =
        f.parentId && typeof f.parentId === "string" && byId.has(f.parentId) ? (f.parentId as string) : null;
      const list = childrenByParent.get(parentKey) ?? [];
      list.push(f);
      childrenByParent.set(parentKey, list);
    }

    return { byId, childrenByParent };
  }, [folders]);

  const selectedMailbox = useMemo(() => mailboxById.get(folderId) ?? null, [folderId, mailboxById]);
  const _selectedIsSystemFolder = useMemo(() => {
    const role = (selectedMailbox?.role ?? "").trim();
    return role.length > 0;
  }, [selectedMailbox]);

  const _selectedHasChildren = useMemo(() => {
    const children = folderIndex.childrenByParent.get(folderId) ?? [];
    return children.length > 0;
  }, [folderId, folderIndex.childrenByParent]);

  // Suppress unused variable warnings (these may be used in the future)
  void _selectedIsSystemFolder;
  void _selectedHasChildren;

  const folderOptions = useMemo(() => {
    type Opt = { id: string; label: string; depth: number };
    const out: Opt[] = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = folderIndex.childrenByParent.get(parentId) ?? [];
      for (const f of children) {
        out.push({ id: f.id, label: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folderIndex.childrenByParent]);

  const normalizedFolderQuery = useMemo(() => folderQuery.trim().toLowerCase(), [folderQuery]);
  const { visibleFolderIds, autoExpandFolderIds } = useMemo(() => {
    if (normalizedFolderQuery === "") return { visibleFolderIds: null as Set<string> | null, autoExpandFolderIds: new Set<string>() };
    const matches = new Set<string>();
    for (const f of folders) {
      if (f.name.toLowerCase().includes(normalizedFolderQuery)) matches.add(f.id);
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
  }, [folderIndex.byId, normalizedFolderQuery, folders]);

  const effectiveOpenFolderIds = useMemo(() => {
    if (!visibleFolderIds) return openFolderIds;
    const next = new Set(openFolderIds);
    for (const id of autoExpandFolderIds) next.add(id);
    return next;
  }, [autoExpandFolderIds, openFolderIds, visibleFolderIds]);

  const toggleFolderOpen = (id: string) => {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const folder = useMemo(() => {
    const selected = folderIndex.byId.get(folderId);
    if (selected) return selected;
    const first = folders[0];
    return first ?? { id: "", name: "Folders", unread: 0, parentId: null };
  }, [folderId, folderIndex.byId, folders]);

  const folderActionsFolder = useMemo(
    () => (folderActionsFolderId ? folderIndex.byId.get(folderActionsFolderId) ?? null : null),
    [folderActionsFolderId, folderIndex.byId]
  );
  const folderActionsMailbox = useMemo(
    () => (folderActionsFolderId ? mailboxById.get(folderActionsFolderId) ?? null : null),
    [folderActionsFolderId, mailboxById]
  );
  const folderActionsIsSystemFolder = useMemo(() => ((folderActionsMailbox?.role ?? "").trim().length > 0 ? true : false), [
    folderActionsMailbox
  ]);
  const folderActionsHasChildren = useMemo(() => {
    if (!folderActionsFolderId) return false;
    return (folderIndex.childrenByParent.get(folderActionsFolderId) ?? []).length > 0;
  }, [folderActionsFolderId, folderIndex.childrenByParent]);

  const showFolderUiError = (message: string) => {
    setFolderUiError(message);
    window.setTimeout(() => setFolderUiError((cur) => (cur === message ? null : cur)), 3000);
  };

  const openCreateFolder = (parentId: string | null) => {
    setFolderOpError(null);
    setFolderOpName("");
    setFolderOpTargetId(null);
    setFolderOpParentId(parentId);
    setFolderOpMode("create");
  };

  const openRenameFolder = (targetId: string) => {
    const target = folderIndex.byId.get(targetId);
    if (!target) return;
    setFolderOpError(null);
    setFolderOpTargetId(targetId);
    setFolderOpName(target.name);
    setFolderOpParentId(null);
    setFolderOpMode("rename");
  };

  const openDeleteFolder = (targetId: string) => {
    if (!folderIndex.byId.has(targetId)) return;
    setFolderOpError(null);
    setFolderOpTargetId(targetId);
    setFolderOpMode("delete");
  };

  const closeFolderOp = (opts?: { force?: boolean }) => {
    if (folderOpBusy && !opts?.force) return;
    setFolderOpMode(null);
    setFolderOpError(null);
    setFolderOpTargetId(null);
    setFolderOpName("");
    setFolderOpParentId(null);
  };

  const submitFolderOp = async () => {
    if (!auth) return;
    if (!folderOpMode) return;
    if (folderOpBusy) return;
    setFolderOpError(null);

    const trimmedName = folderOpName.trim();
    if (folderOpMode === "create" || folderOpMode === "rename") {
      if (trimmedName.length === 0) {
        setFolderOpError("Folder name is required.");
        return;
      }
      if (trimmedName.includes("/") || trimmedName.includes("\\")) {
        setFolderOpError("Please use a folder name without slashes. Nesting is handled by parent folders.");
        return;
      }
    }

    if (folderOpMode === "rename" || folderOpMode === "delete") {
      if (!folderOpTargetId) {
        setFolderOpError("No folder selected.");
        return;
      }
      const role = (mailboxById.get(folderOpTargetId)?.role ?? "").trim();
      if (role.length > 0) {
        setFolderOpError("This is a system folder and cannot be modified.");
        return;
      }
      if (folderOpMode === "delete") {
        const hasChildren = (folderIndex.childrenByParent.get(folderOpTargetId) ?? []).length > 0;
        if (hasChildren) {
          setFolderOpError("This folder has subfolders. Delete (or move) subfolders first.");
          return;
        }
      }
    }

    setFolderOpBusy(true);
    try {
      if (folderOpMode === "create") {
        const { mailboxId } = await createMailbox({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          name: trimmedName,
          parentId: folderOpParentId ?? null
        });
        await loadMailboxes({ force: true });
        setFolderId(mailboxId);
        if (folderOpParentId) {
          setOpenFolderIds((prev) => {
            const next = new Set(prev);
            next.add(folderOpParentId);
            return next;
          });
        }
        closeFolderOp({ force: true });
        return;
      }

      if (folderOpMode === "rename") {
        await renameMailbox({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          mailboxId: folderOpTargetId!,
          name: trimmedName
        });
        await loadMailboxes({ force: true });
        closeFolderOp({ force: true });
        return;
      }

      if (folderOpMode === "delete") {
        await deleteMailbox({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          mailboxId: folderOpTargetId!
        });
        await loadMailboxes({ force: true });
        setFolderId((prev) => (prev === folderOpTargetId ? "" : prev));
        closeFolderOp({ force: true });
      }
    } catch (err) {
      setFolderOpError(err instanceof Error ? err.message : "Folder operation failed");
    } finally {
      setFolderOpBusy(false);
    }
  };

  const canDropFolder = (dragId: string, newParentId: string | null): boolean => {
    if (!dragId) return false;
    if (newParentId === dragId) return false;
    if (!newParentId) return true;
    // Prevent cycles: you cannot drop a folder into its own descendant.
    let cur: string | null | undefined = newParentId;
    while (cur) {
      if (cur === dragId) return false;
      cur = folderIndex.byId.get(cur)?.parentId ?? null;
    }
    return true;
  };

  const performMoveFolder = async (dragId: string, newParentId: string | null) => {
    if (!auth) return;
    const role = (mailboxById.get(dragId)?.role ?? "").trim();
    if (role.length > 0) {
      showFolderUiError("System folders cannot be moved.");
      return;
    }
    if (!canDropFolder(dragId, newParentId)) {
      showFolderUiError("Invalid move (would create a loop).");
      return;
    }
    try {
      await moveMailbox({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        mailboxId: dragId,
        parentId: newParentId
      });
      await loadMailboxes({ force: true });
      setFolderId(dragId);
      if (newParentId) {
        setOpenFolderIds((prev) => {
          const next = new Set(prev);
          next.add(newParentId);
          return next;
        });
      }
    } catch (err) {
      showFolderUiError(err instanceof Error ? err.message : "Failed to move folder");
    }
  };
  const hasDraft = useMemo(() => composeMinimized, [composeMinimized]);
  const isComposeDirty = useMemo(() => {
    if (composeDraft.to.trim() !== "") return true;
    if (composeDraft.cc.trim() !== "") return true;
    if (composeDraft.bcc.trim() !== "") return true;
    if (composeDraft.subject.trim() !== "") return true;
    if (composeDraft.body.trim() !== "") return true;
    if (attachments.length > 0) return true;
    if (scheduleEnabled) return true;
    return false;
  }, [attachments.length, composeDraft.bcc, composeDraft.body, composeDraft.cc, composeDraft.subject, composeDraft.to, scheduleEnabled]);

  useEffect(() => {
    // Switching folder should never keep old expanded state around.
    setExpandedMessageIds(new Set());
    setExpandedAttachmentIds(new Set());
    setExpandedToIds(new Set());
    setDraggingEmailId(null);
    setDraggingEmailFromFolderId(null);
    setDropTargetFolderId(null);
  }, [folderId]);

  useLayoutEffect(() => {
    const pending = pendingScrollAnchorRef.current;
    if (!pending) return;
    const listEl = listRef.current;
    const anchorEl = rowGroupRefs.current.get(pending.messageId) ?? null;
    if (!listEl || !anchorEl) {
      pendingScrollAnchorRef.current = null;
      return;
    }

    const afterTop = anchorEl.getBoundingClientRect().top;
    const delta = afterTop - pending.top;
    if (Math.abs(delta) >= 1) listEl.scrollTop += delta;
    pendingScrollAnchorRef.current = null;
  }, [expandedMessageIds]);

  const performMoveEmail = async (params: { emailId: string; fromFolderId: string; toFolderId: string }) => {
    if (!auth) return;
    if (params.fromFolderId === params.toFolderId) return;
    try {
      await moveEmailToMailbox({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: params.emailId,
        fromMailboxId: params.fromFolderId,
        toMailboxId: params.toFolderId
      });

      // Optimistic local update: remove from the currently viewed folder list.
      if (folderIdRef.current === params.fromFolderId) {
        setMessages((prev) => prev.filter((m) => m.id !== params.emailId));
        setMessagesTotal((prev) => (typeof prev === "number" ? Math.max(0, prev - 1) : prev));
        setExpandedMessageIds((prev) => {
          if (!prev.has(params.emailId)) return prev;
          const next = new Set(prev);
          next.delete(params.emailId);
          return next;
        });
        setExpandedAttachmentIds((prev) => {
          const next = new Set(prev);
          next.delete(params.emailId);
          return next;
        });
        setExpandedToIds((prev) => {
          const next = new Set(prev);
          next.delete(params.emailId);
          return next;
        });
      }

      // Folder unread/total counts can change; refresh in the background.
      void loadMailboxes({ force: true });
    } catch (err) {
      showFolderUiError(err instanceof Error ? err.message : "Failed to move email");
    }
  };

  const loadMessages = async (opts?: { force?: boolean; query?: string; includeBody?: boolean }) => {
    if (!auth) return;
    if (!folderId) return;
    const targetFolderId = folderId;
    // Capture search params at call time to avoid stale closures
    const q = opts?.query ?? searchQuery;
    const body = opts?.includeBody ?? searchIncludeBody;
    // Limit to 5 results when searching, 50 otherwise
    const limit = q.trim() ? 5 : 50;

    setMessagesError(null);
    setMessagesLoading(true);
    try {
      const res = await listEmailSummariesInMailbox({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        mailboxId: targetFolderId,
        limit,
        force: opts?.force,
        query: q.trim() || undefined,
        includeBody: body
      });
      // If user switched folders mid-request, ignore the result.
      if (targetFolderId !== folderId) return;
      setMessages(res.emails.map(toMessage));
      setMessagesTotal(typeof res.total === "number" ? res.total : null);
      setBodyErrors({});
      setBodyLoadingIds(new Set());
    } catch (err) {
      if (targetFolderId !== folderId) return;
      setMessagesError(err instanceof Error ? err.message : "Failed to load emails");
      setMessages([]);
      setMessagesTotal(null);
    } finally {
      if (targetFolderId === folderId) setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) return;
    if (!folderId) {
      setMessages([]);
      setMessagesTotal(null);
      setMessagesError(null);
      setMessagesLoading(false);
      setBodyErrors({});
      setBodyLoadingIds(new Set());
      return;
    }
    // Always force refresh when folder changes to avoid stale cached data
    void loadMessages({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accountId, auth?.authHeader, auth?.session.apiUrl, folderId]);

  // --- Debounced search ---
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!auth) return;
    if (!folderId) return;

    // Clear any pending search timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // Debounce search requests (250ms)
    searchTimeoutRef.current = setTimeout(() => {
      void loadMessages({ force: true, query: searchQuery, includeBody: searchIncludeBody });
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchIncludeBody]);

  // --- JMAP WebSocket Push ---
  useEffect(() => {
    folderIdRef.current = folderId;
  }, [folderId]);

  // Debounced refresh triggered by push notifications
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushClientRef = useRef<JmapPushClient | null>(null);

  useEffect(() => {
    if (!auth) return;
    const wsUrl = auth.session.webSocketUrl;
    if (!wsUrl) {
      console.log("[JmapPush] No webSocketUrl in session, push disabled");
      return;
    }

    const debounceMs = 800;

    const handleStateChange = (change: StateChange) => {
      // IMPORTANT: A websocket session can include StateChange for multiple accounts.
      // Only react to changes for the currently displayed account, otherwise other accounts
      // (e.g. "Work") will cause refreshes/clears while viewing "Personal".
      const affectsMailbox = stateChangeAffectsAccount(change, auth.accountId, "Mailbox");
      const affectsEmail = stateChangeAffectsAccount(change, auth.accountId, "Email");

      if (!affectsMailbox && !affectsEmail) return;

      console.log("[JmapPush] StateChange received:", {
        affectsMailbox,
        affectsEmail,
        changed: change.changed
      });

      // Clear cached email lists immediately so folder switches get fresh data
      if (affectsEmail) {
        clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      }

      // Debounce: clear any pending refresh and schedule a new one
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        const startTime = performance.now();

        const refreshPromises: Promise<void>[] = [];

        if (affectsMailbox) {
          console.log("[JmapPush] Refreshing mailboxes...");
          refreshPromises.push(
            (async () => {
              await loadMailboxes({ force: true });
              console.log("[JmapPush] Mailboxes refreshed in", Math.round(performance.now() - startTime), "ms");
            })()
          );
        }

        if (affectsEmail && folderIdRef.current) {
          console.log("[JmapPush] Refreshing messages...");
          refreshPromises.push(
            (async () => {
              await loadMessages({ force: true });
              console.log("[JmapPush] Messages refreshed in", Math.round(performance.now() - startTime), "ms");
            })()
          );
        }

        if (pushClientRef.current) {
          pushClientRef.current.recordRefresh();
        }

        void Promise.all(refreshPromises);
      }, debounceMs);
    };

    const client = new JmapPushClient({
      webSocketUrl: wsUrl,
      authHeader: auth.authHeader,
      dataTypes: ["Email", "Mailbox"],
      onStateChange: handleStateChange,
      onOpen: () => {
        console.log("[JmapPush] Connected to JMAP WebSocket");
        console.log("[JmapPush] Tip: Access metrics via window.__jmapPushMetrics()");
      },
      onClose: (event) => {
        // Log metrics summary on close
        const m = client.metrics;
        const sessionDurationMs = m.connectionOpenedAt ? Date.now() - m.connectionOpenedAt : 0;
        console.log("[JmapPush] WebSocket closed:", event.code, event.reason);
        console.log("[JmapPush] Session metrics:", {
          sessionDurationMs,
          sessionDurationSec: Math.round(sessionDurationMs / 1000),
          stateChangesReceived: m.stateChangesReceived,
          refreshesTriggered: m.refreshesTriggered,
          lastChangeAt: m.lastChangeAt ? new Date(m.lastChangeAt).toISOString() : null
        });
      },
      onError: () => {
        console.log("[JmapPush] WebSocket error");
      },
      debug: true
    });

    pushClientRef.current = client;
    client.connect();

    // Expose metrics to window for debugging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__jmapPushMetrics = () => {
      const m = client.metrics;
      const sessionDurationMs = m.connectionOpenedAt ? Date.now() - m.connectionOpenedAt : 0;
      return {
        connected: client.isConnected(),
        sessionDurationMs,
        sessionDurationSec: Math.round(sessionDurationMs / 1000),
        stateChangesReceived: m.stateChangesReceived,
        refreshesTriggered: m.refreshesTriggered,
        lastChangeAt: m.lastChangeAt ? new Date(m.lastChangeAt).toISOString() : null
      };
    };

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      // Log final metrics before closing
      const m = client.metrics;
      const sessionDurationMs = m.connectionOpenedAt ? Date.now() - m.connectionOpenedAt : 0;
      console.log("[JmapPush] Closing - Final metrics:", {
        sessionDurationMs,
        sessionDurationSec: Math.round(sessionDurationMs / 1000),
        stateChangesReceived: m.stateChangesReceived,
        refreshesTriggered: m.refreshesTriggered
      });
      client.close();
      pushClientRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__jmapPushMetrics;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accountId, auth?.authHeader, auth?.session.webSocketUrl]);

  useEffect(() => {
    // Always close the picker after selecting a folder.
    setFolderPickerOpen(false);
  }, [folderId]);

  useEffect(() => {
    if (!sendMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = sendMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setSendMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sendMenuOpen]);

  const beginCompose = (draft?: Partial<ComposeDraft>) => {
    setComposeError(null);
    setComposeBusy(false);
    setComposeDraftEmailId(null);
    const inferredFrom = (() => {
      const username = auth?.authHeader ? decodeBasicUsername(auth.authHeader) : null;
      if (username && username.includes("@")) return username;
      const acctName = auth?.session.accounts?.[auth.accountId]?.name ?? "";
      return typeof acctName === "string" && acctName.includes("@") ? acctName : "";
    })();
    const cc = draft?.cc ?? "";
    const bcc = draft?.bcc ?? "";
    setComposeDraft({
      from: draft?.from ?? inferredFrom,
      to: draft?.to ?? "",
      cc,
      bcc,
      subject: draft?.subject ?? "",
      body: draft?.body ? plainTextToHtml(draft.body) : ""
    });
    setComposeShowCc(cc.trim() !== "");
    setComposeShowBcc(bcc.trim() !== "");
    setScheduleEnabled(false);
    setScheduledFor("");
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setAttachments([]);
    setInlineImagesByCid({});
    setComposeMinimized(false);
    setComposeOpen(true);
  };

  const resumeCompose = () => {
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setComposeMinimized(false);
    setComposeOpen(true);
  };

  const minimizeCompose = () => {
    setComposeOpen(false);
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    if (isComposeDirty) setComposeMinimized(true);
  };

  const discardCompose = () => {
    setComposeOpen(false);
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setComposeMinimized(false);
    setComposeBusy(false);
    setComposeError(null);
    setComposeDraftEmailId(null);
    setComposeDraft({ from: "", to: "", cc: "", bcc: "", subject: "", body: "" });
    setComposeShowCc(false);
    setComposeShowBcc(false);
    setScheduleEnabled(false);
    setScheduledFor("");
    setAttachments([]);
    setInlineImagesByCid({});
  };

  const inlineImagesForCurrentHtml = (): Array<{ cid: string; file: File }> => {
    // Only upload images that are still referenced in the current editor HTML.
    const html = composeDraft.body || "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cids = Array.from(doc.querySelectorAll("img[data-cid]"))
      .map((img) => img.getAttribute("data-cid"))
      .filter((cid): cid is string => typeof cid === "string" && cid.trim() !== "");
    const unique = Array.from(new Set(cids));
    return unique
      .map((cid) => ({ cid, file: inlineImagesByCid[cid] }))
      .filter((x): x is { cid: string; file: File } => x.file instanceof File);
  };

  const saveDraftToServer = async () => {
    if (!auth) return;
    if (composeBusy) return;
    setComposeError(null);
    setComposeBusy(true);
    try {
      const draftsId =
        mailboxes.find((m) => (m.role ?? "").toLowerCase() === "drafts")?.id ??
        (await getDraftsMailboxId({ apiUrl: auth.session.apiUrl, authHeader: auth.authHeader, accountId: auth.accountId }));

      const res = await upsertDraftEmail({
        session: auth.session,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        draftsMailboxId: draftsId,
        from: composeDraft.from,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        subject: composeDraft.subject,
        htmlBody: composeDraft.body,
        attachments,
        inlineImages: inlineImagesForCurrentHtml(),
        emailId: composeDraftEmailId
      });

      setComposeDraftEmailId(res.emailId);
      setComposeMinimized(true);
      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMailboxes({ force: true });
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setComposeBusy(false);
    }
  };

  const sendComposeToServer = async () => {
    if (!auth) return;
    if (composeBusy) return;
    setComposeError(null);

    if (composeDraft.from.trim() === "") {
      setComposeError("From address is required.");
      return;
    }
    if (composeDraft.to.trim() === "" && composeDraft.cc.trim() === "" && composeDraft.bcc.trim() === "") {
      setComposeError("Recipient is required.");
      return;
    }
    if (scheduleEnabled && scheduledFor.trim() === "") {
      setComposeError("Please choose a schedule time.");
      return;
    }

    setComposeBusy(true);
    try {
      const submissionAccountId = getPrimarySubmissionAccountId(auth.session);
      if (!submissionAccountId) {
        throw new Error('JMAP session has no "submission" account (urn:ietf:params:jmap:submission)');
      }

      const draftsId =
        mailboxes.find((m) => (m.role ?? "").toLowerCase() === "drafts")?.id ??
        (await getDraftsMailboxId({ apiUrl: auth.session.apiUrl, authHeader: auth.authHeader, accountId: auth.accountId }));

      const sentId =
        mailboxes.find((m) => (m.role ?? "").toLowerCase() === "sent")?.id ??
        (await getSentMailboxId({ apiUrl: auth.session.apiUrl, authHeader: auth.authHeader, accountId: auth.accountId }));

      const identity = await getOrCreateIdentity({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: submissionAccountId,
        email: composeDraft.from,
        name: activeProfile.name
      });

      const { emailId } = await upsertDraftEmail({
        session: auth.session,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        draftsMailboxId: draftsId,
        from: composeDraft.from,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        subject: composeDraft.subject,
        htmlBody: composeDraft.body,
        attachments,
        inlineImages: inlineImagesForCurrentHtml(),
        emailId: composeDraftEmailId
      });

      const sendAtDate = scheduleEnabled ? new Date(scheduledFor) : null;
      if (scheduleEnabled && (!sendAtDate || Number.isNaN(sendAtDate.getTime()))) {
        setComposeError("Invalid schedule time.");
        return;
      }
      const sendAt = sendAtDate ? sendAtDate.toISOString() : null;
      await sendEmailSubmission({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: submissionAccountId,
        identity,
        emailId,
        draftsMailboxId: draftsId,
        sentMailboxId: sentId,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        sendAt
      });

      discardCompose();
      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMessages({ force: true });
      void loadMailboxes({ force: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      if (message.toLowerCase().includes("invalid e-mail address") || message.toLowerCase().includes("invalid email address")) {
        setComposeError(
          `${message} The “From” address must be a real mailbox/domain configured in Stalwart (create it in the admin UI).`
        );
      } else {
        setComposeError(message);
      }
    } finally {
      setComposeBusy(false);
    }
  };

  const toggleExpanded = (messageId: string) => {
    const ensureBodyLoaded = async (targetMessageId: string) => {
      if (!auth) return;
      setBodyErrors((prev) => {
        if (!prev[targetMessageId]) return prev;
        const next = { ...prev };
        delete next[targetMessageId];
        return next;
      });
      setBodyLoadingIds((prev) => {
        if (prev.has(targetMessageId)) return prev;
        const next = new Set(prev);
        next.add(targetMessageId);
        return next;
      });

      try {
        const body = await getEmailBody({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          emailId: targetMessageId
        });
        const resolved = body.html
          ? await resolveCidImagesToObjectUrls(body.html, body.bodyStructure)
          : { html: body.html ?? "", objectUrls: [] };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === targetMessageId ? { ...m, html: resolved.html || m.html, text: body.text ?? m.text } : m
          )
        );
      } catch (err) {
        setBodyErrors((prev) => ({
          ...prev,
          [targetMessageId]: err instanceof Error ? err.message : "Failed to load message body"
        }));
      } finally {
        setBodyLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetMessageId);
          return next;
        });
      }
    };

    const markAsReadIfNeeded = async (targetMessageId: string) => {
      if (!auth) return;
      // Find the message and check if it's unread
      const msg = messages.find((m) => m.id === targetMessageId);
      if (!msg || !msg.unread) return;

      // Optimistically update local state
      setMessages((prev) => prev.map((m) => (m.id === targetMessageId ? { ...m, unread: false } : m)));

      // Send JMAP request to mark as read
      const success = await markEmailAsRead({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: targetMessageId
      });

      if (success) {
        // Refresh mailboxes to update unread counts
        void loadMailboxes({ force: true });
      }
    };

    const anchorEl = rowGroupRefs.current.get(messageId) ?? null;
    if (anchorEl) pendingScrollAnchorRef.current = { messageId, top: anchorEl.getBoundingClientRect().top };

    const wasOpen = expandedMessageIds.has(messageId);
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });

    if (!wasOpen) {
      void ensureBodyLoaded(messageId);
      void markAsReadIfNeeded(messageId);
    }
  };

  const toggleAttachments = (messageId: string) => {
    setExpandedAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const toggleStar = (messageId: string) => {
    const run = async () => {
      if (!auth) return;
      const current = messages.find((m) => m.id === messageId);
      if (!current) return;
      const nextStarred = !current.starred;

      // Optimistic update.
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred: nextStarred } : m)));

      const ok = await setEmailStarred({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: messageId,
        starred: nextStarred
      });

      if (!ok) {
        // Revert on failure.
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred: !nextStarred } : m)));
        return;
      }

      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMessages({ force: true });
    };

    void run();
  };

  const toggleUnread = (messageId: string) => {
    const run = async () => {
      if (!auth) return;
      const current = messages.find((m) => m.id === messageId);
      if (!current) return;
      const nextUnread = !current.unread;

      // Optimistic update.
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, unread: nextUnread } : m)));

      const ok = nextUnread
        ? await markEmailAsUnread({
            apiUrl: auth.session.apiUrl,
            authHeader: auth.authHeader,
            accountId: auth.accountId,
            emailId: messageId
          })
        : await markEmailAsRead({
            apiUrl: auth.session.apiUrl,
            authHeader: auth.authHeader,
            accountId: auth.accountId,
            emailId: messageId
          });

      if (!ok) {
        // Revert on failure.
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, unread: !nextUnread } : m)));
        return;
      }

      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMessages({ force: true });
      void loadMailboxes({ force: true }); // update unread counts
    };

    void run();
  };

  const deleteMessage = (messageId: string) => {
    const run = async () => {
      if (!auth) return;
      const existing = messages.find((m) => m.id === messageId);
      if (!existing) return;

      // Optimistic removal.
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setExpandedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      setRowActionsMessageId((prev) => (prev === messageId ? null : prev));

      const ok = await destroyEmail({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: messageId
      });

      if (!ok) {
        // Reinsert (best-effort) on failure.
        setMessages((prev) => [existing, ...prev]);
        return;
      }

      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMessages({ force: true });
      void loadMailboxes({ force: true }); // update counts
    };

    void run();
  };

  const rowActionsMessage = useMemo(
    () => (rowActionsMessageId ? messages.find((m) => m.id === rowActionsMessageId) ?? null : null),
    [messages, rowActionsMessageId]
  );

  const formatBytes = (bytes: number) => {
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

  const triggerDownload = (filename: string, contentType: string, content: string) => {
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

  const triggerBlobDownload = (filename: string, blob: Blob) => {
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

  const sanitizeFilename = (value: string) => {
    const trimmed = value.trim();
    const safe = (trimmed || "message").replace(/[/\\?%*:|"<>]/g, "_");
    return safe.length > 180 ? safe.slice(0, 180) : safe;
  };

  const buildJmapDownloadUrl = (template: string, params: { accountId: string; blobId: string; name: string; type: string }) => {
    // Template typically: /jmap/download/{accountId}/{blobId}/{name}?type={type}
    return template
      .replaceAll("{accountId}", encodeURIComponent(params.accountId))
      .replaceAll("{blobId}", encodeURIComponent(params.blobId))
      .replaceAll("{name}", encodeURIComponent(params.name))
      .replaceAll("{type}", encodeURIComponent(params.type));
  };

  const resolveCidImagesToObjectUrls = async (
    html: string,
    bodyStructure: unknown | undefined
  ): Promise<{ html: string; objectUrls: string[] }> => {
    if (!auth) return { html, objectUrls: [] };
    if (!html || html.trim() === "") return { html, objectUrls: [] };

    type Part = {
      blobId?: string;
      cid?: string;
      type?: string;
      name?: string;
      subParts?: Part[];
    };

    const normalizeCid = (cid: string) => cid.trim().replace(/^<|>$/g, "");

    const cidToPart = new Map<string, Part>();
    const walk = (p: Part | undefined) => {
      if (!p) return;
      if (typeof p.cid === "string" && typeof p.blobId === "string") {
        const k = normalizeCid(p.cid);
        if (k) cidToPart.set(k, p);
      }
      for (const sp of p.subParts ?? []) walk(sp);
    };
    walk(bodyStructure as Part | undefined);

    if (cidToPart.size === 0) return { html, objectUrls: [] };

    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"));

    const objectUrls: string[] = [];
    const cidInUse = new Map<string, HTMLImageElement[]>();

    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (!src.toLowerCase().startsWith("cid:")) continue;
      const cid = normalizeCid(src.slice(4));
      if (!cid) continue;
      const list = cidInUse.get(cid) ?? [];
      list.push(img);
      cidInUse.set(cid, list);
    }

    for (const [cid, targets] of cidInUse.entries()) {
      const part = cidToPart.get(cid);
      if (!part?.blobId) continue;
      const type = typeof part.type === "string" && part.type.trim() ? part.type : "application/octet-stream";
      const name =
        typeof part.name === "string" && part.name.trim()
          ? part.name
          : type.startsWith("image/")
            ? `inline-${cid}.${type.split("/")[1] ?? "img"}`
            : `inline-${cid}`;
      const url = buildJmapDownloadUrl(auth.session.downloadUrl, {
        accountId: auth.accountId,
        blobId: part.blobId,
        name,
        type
      });

      const res = await fetch(url, { headers: { Authorization: auth.authHeader } });
      if (!res.ok) continue;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      for (const img of targets) img.setAttribute("src", objectUrl);
    }

    return { html: doc.body.innerHTML, objectUrls };
  };

  const downloadEml = async (m: Message) => {
    if (!auth) return;
    if (!m.blobId) return;
    const filename = `${sanitizeFilename(m.subject)}.eml`;
    const url = buildJmapDownloadUrl(auth.session.downloadUrl, {
      accountId: auth.accountId,
      blobId: m.blobId,
      name: filename,
      type: "message/rfc822"
    });
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: auth.authHeader
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      triggerBlobDownload(filename, blob);
    } catch (e) {
      console.error("[EmlDownload] failed:", e);
      globalThis.alert("Failed to download .eml. Please try again.");
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLogo}>
          <span className={styles.headerDuck} aria-hidden="true">🦆</span>
          <span className={styles.headerBrand}>{branding}</span>
        </div>
        <div className={styles.headerSearch}>
          <label className={styles.searchLabel}>
            <span className={styles.srOnly}>Search</span>
            <input
              className={styles.search}
              placeholder="Search mail…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${styles.searchBodyToggle} ${searchIncludeBody ? styles.searchBodyToggleActive : ""}`}
            title={searchIncludeBody ? "Searching message text (click to disable)" : "Search message text"}
            onClick={() => setSearchIncludeBody((prev) => !prev)}
          >
            <FileText className={styles.icon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.headerActions}>
          {auth && (() => {
            const signedInEmail = decodeBasicUsername(auth.authHeader);
            if (!signedInEmail) return null;
            return (
              <button
                type="button"
                className={styles.headerEmail}
                title="Click to copy email"
                onClick={() => {
                  void globalThis.navigator?.clipboard?.writeText(signedInEmail);
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 1500);
                }}
              >
                {emailCopied ? "Copied to clipboard" : signedInEmail}
              </button>
            );
          })()}
          <ProfileMenu />
        </div>
      </header>

      <aside className={styles.sidebar} aria-label="Folders">
        <nav className={styles.folders} aria-label="Folders">
          <div className={styles.folderFilterRow}>
            <label className={styles.folderFilterLabel}>
              <span className={styles.srOnly}>Find folder</span>
              <input
                className={styles.folderFilter}
                value={folderQuery}
                placeholder="Find folder…"
                onChange={(e) => setFolderQuery(e.target.value)}
              />
            </label>
          </div>

          <div
            className={styles.folderTree}
            role="tree"
            aria-label="Folders"
            onDragOver={(e) => {
              if (canDragFolders && draggingFolderId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                return;
              }
              if (canDragEmails && draggingEmailId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              if (!canDragFolders) return;
              if (!draggingFolderId) return;
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              const dragId = draggingFolderId ?? e.dataTransfer.getData("text/plain");
              setDraggingFolderId(null);
              setDropTargetFolderId(null);
              void performMoveFolder(dragId, null);
            }}
          >
            {folderUiError && (
              <div className={styles.errorState} role="alert">
                {folderUiError}
              </div>
            )}
            {mailboxesLoading ? (
              <div className={styles.loadingState} aria-live="polite">
                <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                Loading folders…
              </div>
            ) : mailboxesError ? (
              <div className={styles.errorState} role="alert">
                {mailboxesError}{" "}
                <button type="button" className={styles.secondaryButton} onClick={() => void loadMailboxes({ force: true })}>
                  Retry
                </button>
              </div>
            ) : folders.length === 0 ? (
              <div className={styles.emptyState}>No folders.</div>
            ) : (
              (folderIndex.childrenByParent.get(null) ?? [])
                .filter((root) => (visibleFolderIds ? visibleFolderIds.has(root.id) : true))
                .map((root) => {
                  const renderNode = (f: Folder, depth: number): ReactNode => {
                    if (visibleFolderIds && !visibleFolderIds.has(f.id)) return null;
                    const children = folderIndex.childrenByParent.get(f.id) ?? [];
                    const hasChildren = children.length > 0;
                    const isOpen = hasChildren && effectiveOpenFolderIds.has(f.id);
                    const active = f.id === folderId;

                    return (
                      <div key={f.id} className={styles.folderNode}>
                        <div
                          role="treeitem"
                          aria-level={depth + 1}
                          aria-expanded={hasChildren ? isOpen : undefined}
                          className={`${styles.folderItem} ${active ? styles.folderItemActive : ""} ${
                            dropTargetFolderId === f.id ? styles.folderItemDropTarget : ""
                          }`}
                          tabIndex={0}
                          aria-current={active ? "page" : undefined}
                          draggable={canDragFolders && (mailboxById.get(f.id)?.role ?? "").trim().length === 0}
                          onDragStart={(e) => {
                            if (!canDragFolders) return;
                            setDraggingFolderId(f.id);
                            e.dataTransfer.setData("text/plain", f.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            if (!canDragFolders) return;
                            setDraggingFolderId(null);
                            setDropTargetFolderId(null);
                          }}
                          onDragEnter={(e) => {
                            if (canDragFolders && draggingFolderId) {
                              e.preventDefault();
                              setDropTargetFolderId(f.id);
                              return;
                            }
                            if (canDragEmails && draggingEmailId) {
                              e.preventDefault();
                              setDropTargetFolderId(f.id);
                            }
                          }}
                          onDragOver={(e) => {
                            if (canDragFolders && draggingFolderId) {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              return;
                            }
                            if (canDragEmails && draggingEmailId) {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (canDragFolders && draggingFolderId) {
                              const dragId = draggingFolderId ?? e.dataTransfer.getData("text/plain");
                              setDraggingFolderId(null);
                              setDropTargetFolderId(null);
                              void performMoveFolder(dragId, f.id);
                              return;
                            }

                            if (canDragEmails && draggingEmailId) {
                              const emailId = draggingEmailId;
                              const fromFolderId = draggingEmailFromFolderId ?? folderIdRef.current;
                              setDraggingEmailId(null);
                              setDraggingEmailFromFolderId(null);
                              setDropTargetFolderId(null);
                              void performMoveEmail({ emailId, fromFolderId, toFolderId: f.id });
                            }
                          }}
                          onClick={() => setFolderId(f.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFolderId(f.id);
                            }
                          }}
                        >
                          <span
                            className={`${styles.folderLabel} ${f.unread > 0 ? styles.folderLabelUnread : ""} ${
                              hasChildren ? styles.folderLabelParent : ""
                            } ${hasChildren && isOpen ? styles.folderLabelParentOpen : ""}`}
                            style={{ paddingLeft: `${6 + depth * 12}px` }}
                          >
                            {depth > 0 && <CornerDownRight className={`${styles.icon} ${styles.folderBranchIcon}`} aria-hidden="true" />}
                            <span
                              className={`${styles.folderToggle} ${hasChildren ? "" : styles.folderTogglePlaceholder}`}
                              role={hasChildren ? "button" : undefined}
                              tabIndex={hasChildren ? 0 : -1}
                              aria-label={hasChildren ? `${isOpen ? "Collapse" : "Expand"} ${f.name}` : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasChildren) toggleFolderOpen(f.id);
                              }}
                              onKeyDown={(e) => {
                                if (!hasChildren) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleFolderOpen(f.id);
                                }
                              }}
                            >
                              {hasChildren ? (
                                isOpen ? (
                                  <ChevronDown className={styles.icon} aria-hidden="true" />
                                ) : (
                                  <ChevronRight className={styles.icon} aria-hidden="true" />
                                )
                              ) : (
                                <span className={styles.folderToggleSpacer} aria-hidden="true" />
                              )}
                            </span>
                            <span
                              className={styles.folderDuck}
                              aria-hidden="true"
                              style={{ visibility: active ? "visible" : "hidden" }}
                            >
                              🦆
                            </span>
                            <span className={styles.folderNameText}>{f.name}</span>
                          </span>
                          <span className={styles.folderRight} onClick={(e) => e.stopPropagation()}>
                            {f.unread > 0 && <span className={styles.unreadPill}>{f.unread}</span>}
                            <button
                              type="button"
                              className={`${styles.iconButton} ${styles.folderMoreButton}`}
                              aria-label={`Folder actions ${f.name}`}
                              title="Folder actions"
                              onClick={() => {
                                setFolderPickerOpen(false);
                                setFolderActionsFolderId(f.id);
                              }}
                              onFocus={() => setDropTargetFolderId(null)}
                            >
                              <MoreHorizontal className={styles.icon} aria-hidden="true" />
                            </button>
                          </span>
                        </div>

                        {hasChildren && isOpen && (
                          <div role="group" className={styles.folderChildren}>
                            {children.map((c) => renderNode(c, depth + 1))}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return renderNode(root, 0);
                })
            )}
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.sidebarCompose}
            type="button"
            onClick={() => {
              if (composeMinimized) resumeCompose();
              else beginCompose({ to: "", subject: "", body: "" });
            }}
          >
            <Pencil className={styles.icon} aria-hidden="true" />
            <span>Compose</span>
            {hasDraft && <span className={styles.sidebarDraftPill}>1</span>}
          </button>
        </div>
      </aside>

      <section className={styles.content}>
        <div className={styles.mobileTopbar}>
          <button
            type="button"
            className={styles.folderSwitcher}
            onClick={() => setFolderPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={folderPickerOpen}
            aria-controls="folder-picker"
            title="Change folder"
          >
            <span className={styles.folderSwitcherDuck} aria-hidden="true">
              🦆
            </span>
            <span className={styles.folderSwitcherName}>{folder.name}</span>
            <span className={styles.count}>({messagesTotal ?? messages.length})</span>
            <ChevronDown className={`${styles.icon} ${styles.folderSwitcherChevron}`} aria-hidden="true" />
          </button>
          <ProfileMenu />
        </div>

        <section
          ref={(el) => {
            listRef.current = el;
          }}
          className={styles.list}
          aria-label="Message list"
        >
          {messagesLoading ? (
            <div className={styles.loadingState} aria-live="polite">
              <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
              {searchQuery.trim() ? "Searching…" : "Loading emails…"}
            </div>
          ) : messagesError ? (
            <div className={styles.errorState} role="alert">
              {messagesError}{" "}
              <button type="button" className={styles.secondaryButton} onClick={() => void loadMessages({ force: true })}>
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className={styles.emptyState}>
              {searchQuery.trim() ? `No results for "${searchQuery.trim()}"` : "No emails in this folder."}
            </div>
          ) : (
            messages.map((msg) => {
          const isOpen = expandedMessageIds.has(msg.id);
          const regionId = `message-body-${msg.id}`;
          return (
            <div
              key={msg.id}
              ref={(el) => {
                if (el) rowGroupRefs.current.set(msg.id, el);
                else rowGroupRefs.current.delete(msg.id);
              }}
              className={`${styles.rowGroup} ${isOpen ? styles.rowGroupOpen : ""}`}
            >
              <div
                className={`${styles.row} ${canDragEmails ? styles.rowDraggable : ""} ${isOpen ? styles.rowOpen : ""}`}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-controls={regionId}
                aria-label={`Open ${msg.subject}`}
                draggable={canDragEmails}
                onDragStart={(e) => {
                  if (!canDragEmails) return;
                  setDraggingEmailId(msg.id);
                  setDraggingEmailFromFolderId(folderIdRef.current);
                  e.dataTransfer.setData("application/x-duckwebmail-email", msg.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  if (!canDragEmails) return;
                  setDraggingEmailId(null);
                  setDraggingEmailFromFolderId(null);
                  setDropTargetFolderId(null);
                }}
                onClick={() => toggleExpanded(msg.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpanded(msg.id);
                  }
                }}
              >
                <div className={styles.rowGrid}>
                  <div className={styles.bimi} aria-hidden="true" title="BIMI">
                    {getBimiInitial(msg.from)}
                  </div>
                  <div className={`${styles.from} ${msg.unread ? styles.unreadText : ""}`}>{msg.from}</div>
                  <div className={styles.summary}>
                    <span className={`${styles.subject} ${msg.unread ? styles.unreadText : ""}`}>{msg.subject}</span>
                  </div>
                  <div className={styles.rightCell} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.rightMeta}>
                      <div className={styles.date} title={new Date(msg.receivedAt).toLocaleString()}>
                        {formatListArrivalTime(msg.receivedAt)}
                      </div>
                      <div className={styles.rightMetaActions}>
                        {msg.hasAttachments && (
                          <div
                            className={styles.attachmentIndicator}
                            aria-label="Has attachments"
                            title="Has attachments"
                          >
                            <Paperclip className={styles.icon} aria-hidden="true" />
                          </div>
                        )}
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.moreButton}`}
                          aria-label={`More actions ${msg.subject}`}
                          title="More actions"
                          onClick={() => setRowActionsMessageId(msg.id)}
                        >
                          <MoreHorizontal className={styles.icon} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                id={regionId}
                data-testid={regionId}
                className={`${styles.expanded} ${isOpen ? styles.expandedOpen : ""}`}
                role="region"
                aria-label={`Message ${msg.subject}`}
                aria-hidden={!isOpen}
                {...(!isOpen ? ({ inert: "" } as unknown as HTMLAttributes<HTMLDivElement>) : {})}
              >
                <div className={styles.expandedMeta}>
                  <div>
                    <span className={styles.metaLabel}>From:</span> {msg.from}
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Received:</span> {new Date(msg.receivedAt).toLocaleString()}
                  </div>
                </div>

                <div className={styles.expandedSecondRow}>
                  <button
                    type="button"
                    className={styles.toLineButton}
                    title={expandedToIds.has(msg.id) ? "Hide full To header" : "Show full To header"}
                    onClick={() =>
                      setExpandedToIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(msg.id)) next.delete(msg.id);
                        else next.add(msg.id);
                        return next;
                      })
                    }
                  >
                    <span className={styles.metaLabel}>To:</span> {expandedToIds.has(msg.id) ? msg.to : activeProfileName}
                  </button>
                  <div className={styles.downloadRow}>
                    {msg.attachments.length > 0 && (
                      <button
                        type="button"
                        className={styles.attachmentsToggle}
                        aria-label={`Toggle attachments ${msg.subject}`}
                        aria-expanded={expandedAttachmentIds.has(msg.id)}
                        aria-controls={`attachments-${msg.id}`}
                        title="Toggle attachments"
                        onClick={() => toggleAttachments(msg.id)}
                      >
                        <Paperclip className={styles.icon} aria-hidden="true" />
                        <span className={styles.attachmentsToggleLabel}>Attachments</span>
                        <span className={styles.attachmentsToggleCount}>{msg.attachments.length}</span>
                        {expandedAttachmentIds.has(msg.id) ? (
                          <ChevronDown className={`${styles.icon} ${styles.attachmentsToggleChevron}`} aria-hidden="true" />
                        ) : (
                          <ChevronRight className={`${styles.icon} ${styles.attachmentsToggleChevron}`} aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {msg.attachments.length > 0 && (
                  <div
                    id={`attachments-${msg.id}`}
                    className={styles.attachments}
                    aria-label="Attachments"
                    hidden={!expandedAttachmentIds.has(msg.id)}
                  >
                    {msg.attachments.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={styles.attachmentChip}
                        title="Download attachment"
                        aria-label={`Download attachment ${a.name}`}
                        onClick={() => triggerDownload(a.name, a.contentType, a.content)}
                      >
                        <span className={styles.attachmentName}>{a.name}</span>
                        <span className={styles.attachmentSize}>{formatBytes(a.sizeBytes)}</span>
                        <span className={styles.attachmentIcon} aria-hidden="true">
                          <Download className={styles.icon} aria-hidden="true" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {bodyLoadingIds.has(msg.id) ? (
                  <div className={styles.bodyLoading} aria-live="polite">
                    <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                    Loading message…
                  </div>
                ) : bodyErrors[msg.id] ? (
                  <div className={styles.errorState} role="alert">
                    {bodyErrors[msg.id]}
                  </div>
                ) : (
                  <div className={styles.emailBody}>
                    <SafeEmailViewer htmlContent={msg.html ?? ""} textContent={msg.text ?? ""} />
                  </div>
                )}
              </div>
            </div>
          );
            })
          )}
        </section>

        <footer className={styles.appFooter}>
          <div className={styles.footerQuota}>
            {quotaLoading ? (
              <span className={styles.footerQuotaLoading}>Loading…</span>
            ) : quotaError ? (
              <span className={styles.footerQuotaMuted} title={quotaError}>
                Quota unavailable
              </span>
            ) : (() => {
              if (quotas.length === 0) {
                return <span className={styles.footerQuotaMuted}>Quota not configured</span>;
              }
              const storageQuota = quotas.find((q) => q.resourceType === "octets");
              if (!storageQuota) {
                const types = Array.from(new Set(quotas.map((q) => q.resourceType))).join(", ");
                return (
                  <span className={styles.footerQuotaMuted} title={`Available quota resourceTypes: ${types || "none"}`}>
                    Storage quota unavailable
                  </span>
                );
              }
              const limitText = storageQuota.hardLimit ? formatQuotaBytes(storageQuota.hardLimit) : "unlimited";
              return (
                <span className={styles.footerQuotaItem}>
                  Space used: {formatQuotaBytes(storageQuota.used)} / {limitText}
                </span>
              );
            })()}
          </div>
          <div className={styles.footerCopyright}>
            © {new Date().getFullYear()} mail-duck.com
          </div>
        </footer>
      </section>

      {rowActionsMessage && (
        <div
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Message actions"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRowActionsMessageId(null);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>Actions</div>
            </div>
            <div className={styles.sheetBody}>
              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  beginCompose({ to: rowActionsMessage.from, subject: `Re: ${rowActionsMessage.subject}`, body: "" });
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Reply className={styles.icon} aria-hidden="true" />
                  Reply
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  beginCompose({
                    to: "",
                    subject: `Fwd: ${rowActionsMessage.subject}`,
                    body: rowActionsMessage.text ?? ""
                  });
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Forward className={styles.icon} aria-hidden="true" />
                  Forward
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  toggleStar(rowActionsMessage.id);
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Star
                    className={styles.icon}
                    aria-hidden="true"
                    fill={rowActionsMessage.starred ? "currentColor" : "none"}
                  />
                  {rowActionsMessage.starred ? "Unstar" : "Star"}
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  toggleUnread(rowActionsMessage.id);
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  {rowActionsMessage.unread ? (
                    <MailOpen className={styles.icon} aria-hidden="true" />
                  ) : (
                    <Mail className={styles.icon} aria-hidden="true" />
                  )}
                  {rowActionsMessage.unread ? "Mark read" : "Mark unread"}
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                title={!rowActionsMessage.blobId ? "Source unavailable" : "Download as .eml"}
                disabled={!auth || !rowActionsMessage.blobId}
                onClick={() => {
                  void downloadEml(rowActionsMessage);
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <FileDown className={styles.icon} aria-hidden="true" />
                  Download source (.eml)
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  deleteMessage(rowActionsMessage.id);
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Trash2 className={styles.icon} aria-hidden="true" />
                  Delete
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {folderActionsFolderId && folderActionsFolder && (
        <div
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Folder actions"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFolderActionsFolderId(null);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>Actions</div>
            </div>
            <div className={styles.sheetBody}>
              <div className={styles.listTitle} style={{ padding: "0 2px 6px" }}>
                🦆 {folderActionsFolder.name}
              </div>

              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  const parentId = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  openCreateFolder(parentId);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Plus className={styles.icon} aria-hidden="true" />
                  New subfolder
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                disabled={folderActionsIsSystemFolder}
                title={folderActionsIsSystemFolder ? "System folder cannot be renamed" : "Rename folder"}
                onClick={() => {
                  const id = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  openRenameFolder(id);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Pencil className={styles.icon} aria-hidden="true" />
                  Rename
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                disabled={folderActionsIsSystemFolder || folderActionsHasChildren}
                title={
                  folderActionsIsSystemFolder
                    ? "System folder cannot be deleted"
                    : folderActionsHasChildren
                      ? "Delete subfolders first"
                      : "Delete folder"
                }
                onClick={() => {
                  const id = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  openDeleteFolder(id);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Trash2 className={styles.icon} aria-hidden="true" />
                  Delete
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                disabled={folderActionsIsSystemFolder}
                title={folderActionsIsSystemFolder ? "System folder cannot be moved" : "Move to root"}
                onClick={() => {
                  const id = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  void performMoveFolder(id, null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <ChevronDown className={styles.icon} aria-hidden="true" />
                  Move to root
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                onClick={() => {
                  setFolderActionsFolderId(null);
                  openCreateFolder(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Plus className={styles.icon} aria-hidden="true" />
                  New folder (root)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!composeOpen && (
        <button
          type="button"
          className={styles.composeDock}
          aria-label={composeMinimized ? "Resume draft" : "Compose"}
          title={composeMinimized ? "Resume draft" : "Compose"}
          onClick={() => {
            if (composeMinimized) resumeCompose();
            else beginCompose({ to: "", subject: "", body: "" });
          }}
        >
          <Pencil className={`${styles.icon} ${styles.composeDockIcon}`} aria-hidden="true" />
          <span className={styles.composeDockLabel}>{composeMinimized ? "Resume" : "Compose"}</span>
          {composeMinimized && <span className={styles.composeDockDraftPill}>Draft: 1</span>}
        </button>
      )}

      {folderPickerOpen && (
        <div
          id="folder-picker"
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Choose folder"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFolderPickerOpen(false);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>Folders</div>
            </div>

            <div className={styles.sheetBody}>
              <div className={styles.folderFilterRow}>
                <label className={styles.folderFilterLabel}>
                  <span className={styles.srOnly}>Find folder</span>
                  <input
                    className={styles.folderFilter}
                    value={folderQuery}
                    placeholder="Find folder…"
                    onChange={(e) => setFolderQuery(e.target.value)}
                  />
                </label>
              </div>

              <div
                className={styles.folderTree}
                role="tree"
                aria-label="Folders"
                onDragOver={(e) => {
                  if (canDragFolders && draggingFolderId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    return;
                  }
                  if (canDragEmails && draggingEmailId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(e) => {
                  if (!canDragFolders) return;
                  if (!draggingFolderId) return;
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  const dragId = draggingFolderId ?? e.dataTransfer.getData("text/plain");
                  setDraggingFolderId(null);
                  setDropTargetFolderId(null);
                  void performMoveFolder(dragId, null);
                }}
              >
                {folderUiError && (
                  <div className={styles.errorState} role="alert">
                    {folderUiError}
                  </div>
                )}
                {mailboxesLoading ? (
                  <div className={styles.loadingState} aria-live="polite">
                    <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                    Loading folders…
                  </div>
                ) : mailboxesError ? (
                  <div className={styles.errorState} role="alert">
                    {mailboxesError}{" "}
                    <button type="button" className={styles.secondaryButton} onClick={() => void loadMailboxes({ force: true })}>
                      Retry
                    </button>
                  </div>
                ) : folders.length === 0 ? (
                  <div className={styles.emptyState}>No folders.</div>
                ) : (
                  (folderIndex.childrenByParent.get(null) ?? [])
                    .filter((root) => (visibleFolderIds ? visibleFolderIds.has(root.id) : true))
                    .map((root) => {
                      const renderNode = (f: Folder, depth: number): ReactNode => {
                        if (visibleFolderIds && !visibleFolderIds.has(f.id)) return null;
                        const children = folderIndex.childrenByParent.get(f.id) ?? [];
                        const hasChildren = children.length > 0;
                        const isOpen = hasChildren && effectiveOpenFolderIds.has(f.id);
                        const active = f.id === folderId;

                        return (
                          <div key={f.id} className={styles.folderNode}>
                            <div
                              role="treeitem"
                              aria-level={depth + 1}
                              aria-expanded={hasChildren ? isOpen : undefined}
                              className={`${styles.sheetFolderItem} ${active ? styles.sheetFolderItemActive : ""} ${
                                dropTargetFolderId === f.id ? styles.folderItemDropTarget : ""
                              }`}
                              tabIndex={0}
                              aria-current={active ? "page" : undefined}
                              draggable={canDragFolders && (mailboxById.get(f.id)?.role ?? "").trim().length === 0}
                              onDragStart={(e) => {
                                if (!canDragFolders) return;
                                setDraggingFolderId(f.id);
                                e.dataTransfer.setData("text/plain", f.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                if (!canDragFolders) return;
                                setDraggingFolderId(null);
                                setDropTargetFolderId(null);
                              }}
                              onDragEnter={(e) => {
                                if (canDragFolders && draggingFolderId) {
                                  e.preventDefault();
                                  setDropTargetFolderId(f.id);
                                  return;
                                }
                                if (canDragEmails && draggingEmailId) {
                                  e.preventDefault();
                                  setDropTargetFolderId(f.id);
                                }
                              }}
                              onDragOver={(e) => {
                                if (canDragFolders && draggingFolderId) {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  return;
                                }
                                if (canDragEmails && draggingEmailId) {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                if (canDragFolders && draggingFolderId) {
                                  const dragId = draggingFolderId ?? e.dataTransfer.getData("text/plain");
                                  setDraggingFolderId(null);
                                  setDropTargetFolderId(null);
                                  void performMoveFolder(dragId, f.id);
                                  return;
                                }

                                if (canDragEmails && draggingEmailId) {
                                  const emailId = draggingEmailId;
                                  const fromFolderId = draggingEmailFromFolderId ?? folderIdRef.current;
                                  setDraggingEmailId(null);
                                  setDraggingEmailFromFolderId(null);
                                  setDropTargetFolderId(null);
                                  void performMoveEmail({ emailId, fromFolderId, toFolderId: f.id });
                                }
                              }}
                              onClick={() => setFolderId(f.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setFolderId(f.id);
                                }
                              }}
                            >
                              <span
                                className={`${styles.folderLabel} ${f.unread > 0 ? styles.folderLabelUnread : ""} ${
                                  hasChildren ? styles.folderLabelParent : ""
                                } ${hasChildren && isOpen ? styles.folderLabelParentOpen : ""}`}
                                style={{ paddingLeft: `${6 + depth * 12}px` }}
                              >
                                {depth > 0 && (
                                  <CornerDownRight className={`${styles.icon} ${styles.folderBranchIcon}`} aria-hidden="true" />
                                )}
                                <span
                                  className={`${styles.folderToggle} ${hasChildren ? "" : styles.folderTogglePlaceholder}`}
                                  role={hasChildren ? "button" : undefined}
                                  tabIndex={hasChildren ? 0 : -1}
                                  aria-label={hasChildren ? `${isOpen ? "Collapse" : "Expand"} ${f.name}` : undefined}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasChildren) toggleFolderOpen(f.id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (!hasChildren) return;
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleFolderOpen(f.id);
                                    }
                                  }}
                                >
                                  {hasChildren ? (
                                    isOpen ? (
                                      <ChevronDown className={styles.icon} aria-hidden="true" />
                                    ) : (
                                      <ChevronRight className={styles.icon} aria-hidden="true" />
                                    )
                                  ) : (
                                    <span className={styles.folderToggleSpacer} aria-hidden="true" />
                                  )}
                                </span>
                                <span
                                  className={styles.folderDuck}
                                  aria-hidden="true"
                                  style={{ visibility: active ? "visible" : "hidden" }}
                                >
                                  🦆
                                </span>
                                <span className={styles.folderNameText}>{f.name}</span>
                              </span>
                              <span className={styles.folderRight} onClick={(e) => e.stopPropagation()}>
                                {f.unread > 0 && <span className={styles.unreadPill}>{f.unread}</span>}
                                <button
                                  type="button"
                                  className={`${styles.iconButton} ${styles.folderMoreButton}`}
                                  aria-label={`Folder actions ${f.name}`}
                                  title="Folder actions"
                                  onClick={() => {
                                    setFolderPickerOpen(false);
                                    setFolderActionsFolderId(f.id);
                                  }}
                                >
                                  <MoreHorizontal className={styles.icon} aria-hidden="true" />
                                </button>
                              </span>
                            </div>

                            {hasChildren && isOpen && (
                              <div role="group" className={styles.folderChildren}>
                                {children.map((c) => renderNode(c, depth + 1))}
                              </div>
                            )}
                          </div>
                        );
                      };

                      return renderNode(root, 0);
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {composeOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Compose email"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) minimizeCompose();
          }}
        >
          <div className={styles.modal} role="document">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>New email</div>
            </div>

            <div className={styles.modalBody}>
              {composeError && (
                <div className={styles.errorState} role="alert" style={{ marginBottom: 10 }}>
                  {composeError}
                </div>
              )}
              <div className={styles.field}>
                <div className={styles.fieldHeaderRow}>
                  <div className={styles.fieldLabel}>From</div>
                  {isDesktop && activeProfileName.trim() !== "" && (
                    <div className={styles.fieldHint} title="Profile">
                      {activeProfileName}
                    </div>
                  )}
                </div>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="sender@example.com"
                  value={composeDraft.from}
                  disabled={composeBusy}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, from: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldHeaderRow}>
                  <div className={styles.fieldLabel}>To</div>
                  {isDesktop && (
                    <div className={styles.fieldActions}>
                      <button
                        type="button"
                        className={styles.miniToggle}
                        aria-pressed={composeShowCc}
                        title="Add CC"
                        onClick={() => setComposeShowCc((v) => !v)}
                        disabled={composeBusy}
                      >
                        CC
                      </button>
                      <button
                        type="button"
                        className={styles.miniToggle}
                        aria-pressed={composeShowBcc}
                        title="Add BCC"
                        onClick={() => setComposeShowBcc((v) => !v)}
                        disabled={composeBusy}
                      >
                        BCC
                      </button>
                    </div>
                  )}
                </div>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="recipient@example.com"
                  value={composeDraft.to}
                  disabled={composeBusy}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, to: e.target.value }))}
                />
              </div>

              {(composeShowCc || composeDraft.cc.trim() !== "") && (
                <label className={styles.field}>
                  CC
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="cc@example.com"
                    value={composeDraft.cc}
                    disabled={composeBusy}
                    onChange={(e) => setComposeDraft((prev) => ({ ...prev, cc: e.target.value }))}
                  />
                </label>
              )}

              {(composeShowBcc || composeDraft.bcc.trim() !== "") && (
                <label className={styles.field}>
                  BCC
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="bcc@example.com"
                    value={composeDraft.bcc}
                    disabled={composeBusy}
                    onChange={(e) => setComposeDraft((prev) => ({ ...prev, bcc: e.target.value }))}
                  />
                </label>
              )}
              <label className={styles.field}>
                Subject
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Subject"
                  value={composeDraft.subject}
                  disabled={composeBusy}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, subject: e.target.value }))}
                />
              </label>

              {scheduleEnabled && (
                <label className={styles.field}>
                  Scheduled for
                  <input
                    ref={scheduledForInputRef}
                    className={`${styles.input} ${styles.datetimeInput}`}
                    type="datetime-local"
                    value={scheduledFor}
                    disabled={composeBusy}
                    onChange={(e) => setScheduledFor(e.target.value)}
                  />
                </label>
              )}
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Message</div>
                <ComposeEditor
                  valueHtml={composeDraft.body}
                  onChangeHtml={(next) => setComposeDraft((prev) => ({ ...prev, body: next }))}
                  onInlineImage={({ cid, file }) => setInlineImagesByCid((prev) => ({ ...prev, [cid]: file }))}
                  placeholder="Write your message… (paste / drop images inline)"
                />
              </div>

              <input
                ref={attachmentsInputRef}
                className={styles.attachmentsInput}
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length === 0) return;
                  setAttachments((prev) => [...prev, ...files]);
                  e.currentTarget.value = "";
                }}
              />

              {attachments.length > 0 && (
                <div className={styles.attachmentsSection} aria-label="Attachments">
                  <div className={styles.attachmentsHeader}>Attachments</div>
                  <div className={styles.attachmentChips}>
                    {attachments.map((f, idx) => (
                      <div key={`${f.name}-${f.size}-${idx}`} className={styles.attachmentChipCompose}>
                        <Paperclip className={styles.icon} aria-hidden="true" />
                        <span className={styles.attachmentChipName} title={f.name}>
                          {f.name}
                        </span>
                        <button
                          type="button"
                          className={styles.attachmentRemove}
                          aria-label={`Remove ${f.name}`}
                          title="Remove"
                          onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <X className={styles.icon} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <div className={styles.modalFooterLeft}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={composeBusy}
                  onClick={() => {
                    if (isComposeDirty) setComposeCancelConfirmOpen(true);
                    else discardCompose();
                  }}
                >
                  Cancel
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  title="Attach file"
                  aria-label="Attach file"
                  disabled={composeBusy}
                  onClick={() => attachmentsInputRef.current?.click()}
                >
                  <Paperclip className={styles.icon} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.modalFooterRight}>
                <div ref={sendMenuRef} className={styles.splitButton}>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={composeBusy}
                    onClick={() => void sendComposeToServer()}
                  >
                    {composeBusy ? "Sending…" : scheduleEnabled ? "Schedule send" : "Send"}
                  </button>
                  <button
                    className={styles.splitToggle}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={sendMenuOpen}
                    aria-label="More send options"
                    title="More send options"
                    disabled={composeBusy}
                    onClick={() => setSendMenuOpen((v) => !v)}
                  >
                    <ChevronDown className={styles.icon} aria-hidden="true" />
                  </button>

                  {sendMenuOpen && (
                    <div className={styles.sendMenu} role="menu" aria-label="Send options">
                      <button
                        className={styles.sendMenuItem}
                        type="button"
                        role="menuitem"
                        disabled={composeBusy}
                        onClick={() => {
                          const run = async () => {
                            setSendMenuOpen(false);
                            await saveDraftToServer();
                            setComposeOpen(false);
                            setComposeCancelConfirmOpen(false);
                          };
                          void run();
                        }}
                      >
                        <span className={styles.sendMenuItemRow}>
                          <Save className={styles.icon} aria-hidden="true" />
                          {composeBusy ? "Saving…" : "Save as draft"}
                        </span>
                      </button>
                      {scheduleEnabled && (
                        <button
                          className={styles.sendMenuItem}
                          type="button"
                          role="menuitem"
                          disabled={composeBusy}
                          onClick={() => {
                            setScheduleEnabled(false);
                            setScheduledFor("");
                            setSendMenuOpen(false);
                          }}
                        >
                          <span className={styles.sendMenuItemRow}>
                            <Mail className={styles.icon} aria-hidden="true" />
                            Send now
                          </span>
                        </button>
                      )}
                      {scheduleEnabled ? (
                        <button
                          className={styles.sendMenuItem}
                          type="button"
                          role="menuitem"
                          disabled={composeBusy}
                          onClick={() => {
                            if (!scheduledFor) setScheduledFor(toDatetimeLocalValue(roundToNextMinutes(new Date(), 15)));
                            setSendMenuOpen(false);
                            // Focus the datetime input once the menu is closed.
                            window.requestAnimationFrame(() => scheduledForInputRef.current?.focus());
                          }}
                        >
                          <span className={styles.sendMenuItemRow}>
                            <Clock className={styles.icon} aria-hidden="true" />
                            Change schedule
                          </span>
                        </button>
                      ) : (
                        <button
                          className={styles.sendMenuItem}
                          type="button"
                          role="menuitem"
                          disabled={composeBusy}
                          onClick={() => {
                            setScheduleEnabled(true);
                            if (!scheduledFor) setScheduledFor(toDatetimeLocalValue(roundToNextMinutes(new Date(), 15)));
                            setSendMenuOpen(false);
                            window.requestAnimationFrame(() => scheduledForInputRef.current?.focus());
                          }}
                        >
                          <span className={styles.sendMenuItemRow}>
                            <Clock className={styles.icon} aria-hidden="true" />
                            Schedule delivery
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {composeCancelConfirmOpen && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Save draft"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setComposeCancelConfirmOpen(false);
          }}
        >
          <div className={styles.confirmModal} role="document">
            <div className={styles.confirmTitle}>Save draft?</div>
            <div className={styles.confirmBody}>You have changes in this email. Save it as a draft?</div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.dangerAction}`}
                onClick={() => {
                  setComposeCancelConfirmOpen(false);
                  discardCompose();
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setComposeCancelConfirmOpen(false)}
              >
                Continue editing
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={composeBusy}
                onClick={() => {
                  const run = async () => {
                    setComposeCancelConfirmOpen(false);
                    await saveDraftToServer();
                    setComposeOpen(false);
                  };
                  void run();
                }}
              >
                Save draft
              </button>
            </div>
          </div>
        </div>
      )}

      {folderOpMode && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={
            folderOpMode === "create" ? "Create folder" : folderOpMode === "rename" ? "Rename folder" : "Delete folder"
          }
          onMouseDown={(e) => {
            if (folderOpBusy) return;
            if (e.target === e.currentTarget) closeFolderOp();
          }}
        >
          <div className={styles.folderOpModal} role="document">
            <div className={styles.confirmTitle}>
              {folderOpMode === "create" ? "New folder" : folderOpMode === "rename" ? "Rename folder" : "Delete folder"}
            </div>

            {folderOpError && (
              <div className={styles.folderOpError} role="alert">
                {folderOpError}
              </div>
            )}

            {folderOpMode === "delete" ? (
              <div className={styles.confirmBody}>
                Delete <strong>{folderIndex.byId.get(folderOpTargetId ?? "")?.name ?? "this folder"}</strong>? This can’t be undone.
              </div>
            ) : (
              <div className={styles.folderOpForm}>
                {folderOpMode === "create" && (
                  <label className={styles.folderOpField}>
                    <span className={styles.folderOpLabel}>Parent</span>
                    <select
                      className={styles.input}
                      value={folderOpParentId ?? ""}
                      onChange={(e) => setFolderOpParentId(e.target.value === "" ? null : e.target.value)}
                      disabled={folderOpBusy}
                    >
                      <option value="">(Root)</option>
                      {folderOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {`${"— ".repeat(o.depth)}${o.label}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className={styles.folderOpField}>
                  <span className={styles.folderOpLabel}>Name</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={folderOpName}
                    onChange={(e) => setFolderOpName(e.target.value)}
                    placeholder={folderOpMode === "create" ? "e.g. Receipts" : undefined}
                    autoFocus
                    disabled={folderOpBusy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitFolderOp();
                    }}
                  />
                </label>
              </div>
            )}

            <div className={styles.confirmActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => closeFolderOp()} disabled={folderOpBusy}>
                Cancel
              </button>
              {folderOpMode === "delete" ? (
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.dangerAction}`}
                  onClick={() => void submitFolderOp()}
                  disabled={folderOpBusy}
                >
                  {folderOpBusy ? "Deleting…" : "Delete"}
                </button>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={() => void submitFolderOp()} disabled={folderOpBusy}>
                  {folderOpMode === "create" ? (folderOpBusy ? "Creating…" : "Create") : folderOpBusy ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
