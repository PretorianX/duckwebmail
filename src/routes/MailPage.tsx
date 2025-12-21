import { useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode, useCallback } from "react";
import { VariableSizeList } from "react-window";


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
import { useTranslation } from "react-i18next";

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
  formatSenderForList,
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
import { PaginationController } from "../jmap/PaginationController";
import { fetchBimiLogo, normalizeBimiDomainKey } from "../jmap/bimi";
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
  fromRaw?: JmapEmailSummary["from"];
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
  const { t } = useTranslation();
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
  const [bodyLoadingIds, setBodyLoadingIds] = useState<Set<string>>(() => new Set());
  const [bodyErrors, setBodyErrors] = useState<Record<string, string>>({});
  const [emailCopied, setEmailCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIncludeBody, setSearchIncludeBody] = useState(false);
  const [paginationMode, setPaginationMode] = useState<"infinite" | "classic">("infinite");
  const [classicPage, setClassicPage] = useState(1);
  const [classicPageSize, setClassicPageSize] = useState(50);
  
  // Pagination controller
  const controllerRef = useRef<PaginationController | null>(null);
  const [controllerState, setControllerState] = useState<ReturnType<PaginationController["getState"]>>(null);
  
  // Virtual list refs
  const virtualListRef = useRef<VariableSizeList | null>(null);
  const rowHeightsRef = useRef<Map<string, number>>(new Map());
  // Base height for collapsed rows; closer to actual CSS row height to avoid visible gaps before measurement.
  // Includes 4px bottom padding from rowWrapper for gap between rows.
  const defaultRowHeight = isDesktop ? 52 : 56;
  const rowResizeObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  
  // Message body content (separate from summary)
  const [messageBodies, setMessageBodies] = useState<Map<string, { html?: string; text?: string }>>(new Map());

  // When expanding/collapsing rows, react-window must be told to recompute sizes.
  useLayoutEffect(() => {
    virtualListRef.current?.resetAfterIndex(0);
  }, [expandedMessageIds]);
  
  // Helper to get messages from controller state
  const messages = useMemo(() => {
    if (!controllerState) return [];
    return controllerState.ids.map((id) => {
      const item = controllerState.itemsById.get(id);
      if (!item) return null;
      const body = messageBodies.get(id);
      const msg = toMessage(item);
      if (body) {
        msg.html = body.html;
        msg.text = body.text;
      }
      return msg;
    }).filter((m): m is Message => m !== null);
  }, [controllerState, messageBodies]);
  
  const messagesLoading = controllerState?.loading ?? false;
  const messagesError = controllerState?.error ?? null;
  const messagesTotal = null; // Will be computed if available
  // Keyed by normalized domain (lowercased), not raw email address.
  const [bimiLogos, setBimiLogos] = useState<Map<string, string | null>>(new Map());
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
        setFolderOpError(t("mail.folderNameRequired"));
        return;
      }
      if (trimmedName.includes("/") || trimmedName.includes("\\")) {
        setFolderOpError(t("mail.folderNameNoSlashes"));
        return;
      }
    }

    if (folderOpMode === "rename" || folderOpMode === "delete") {
      if (!folderOpTargetId) {
        setFolderOpError(t("mail.noFolderSelected"));
        return;
      }
      const role = (mailboxById.get(folderOpTargetId)?.role ?? "").trim();
      if (role.length > 0) {
        setFolderOpError(t("mail.systemFolderCannotBeModified"));
        return;
      }
      if (folderOpMode === "delete") {
        const hasChildren = (folderIndex.childrenByParent.get(folderOpTargetId) ?? []).length > 0;
        if (hasChildren) {
          setFolderOpError(t("mail.folderHasSubfolders"));
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
      if (folderIdRef.current === params.fromFolderId && controllerRef.current) {
        controllerRef.current.removeItem(params.emailId);
        syncControllerState();
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

  // Initialize controller when auth changes
  useEffect(() => {
    if (!auth) {
      controllerRef.current = null;
      setControllerState(null);
      return;
    }

    const pageSize = isDesktop ? 50 : 30;
    controllerRef.current = new PaginationController({
      apiUrl: auth.session.apiUrl,
      authHeader: auth.authHeader,
      accountId: auth.accountId,
      pageSize,
      query: searchQuery.trim() || undefined,
      includeBody: searchIncludeBody,
      debug: true
    });

    return () => {
      controllerRef.current = null;
    };
  }, [auth?.accountId, auth?.authHeader, auth?.session.apiUrl, isDesktop, searchQuery, searchIncludeBody]);

  // Sync controller state to React state
  const syncControllerState = useCallback(() => {
    if (!controllerRef.current) {
      setControllerState(null);
      return;
    }
    const state = controllerRef.current.getState();
    setControllerState(state);
  }, []);

  // Load messages using controller
  const loadMessages = async (opts?: { force?: boolean; query?: string; includeBody?: boolean }) => {
    if (!auth) return;
    if (!folderId) return;
    if (!controllerRef.current) return;

    const targetFolderId = folderId;
    const q = opts?.query ?? searchQuery;
    const body = opts?.includeBody ?? searchIncludeBody;

    // Update controller query params if changed
    if (controllerRef.current) {
      // Recreate controller if query params changed
      const pageSize = isDesktop ? 50 : 30;
      controllerRef.current = new PaginationController({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        pageSize,
        query: q.trim() || undefined,
        includeBody: body,
        debug: true
      });
    }

    try {
      await controllerRef.current.initQuery(targetFolderId);
      syncControllerState();
      
      // Fetch BIMI logos for loaded messages
      const state = controllerRef.current.getState();
      if (state) {
      const senderDomains = new Set<string>();
        for (const id of state.ids.slice(0, 50)) { // First 50 for BIMI
          const item = state.itemsById.get(id);
          if (item) {
            const senderEmail = item.from?.[0]?.email;
        const domain = senderEmail ? normalizeBimiDomainKey(senderEmail) : null;
        if (domain) {
          senderDomains.add(domain);
            }
        }
      }
      
      const logoPromises = Array.from(senderDomains).map(async (domain) => {
        const logoUrl = await fetchBimiLogo(domain);
        return { domain, logoUrl };
      });
      
      const logoResults = await Promise.all(logoPromises);
      setBimiLogos((prev) => {
        const next = new Map(prev);
        for (const { domain, logoUrl } of logoResults) {
          next.set(domain, logoUrl);
        }
        return next;
      });
      }
    } catch (err) {
      syncControllerState();
      console.error("Failed to load messages:", err);
    }
  };

  useEffect(() => {
    if (!auth) {
      setControllerState(null);
      return;
    }
    if (!folderId) {
      if (controllerRef.current) {
        controllerRef.current.reset(null);
      }
      setControllerState(null);
      setBodyErrors({});
      setBodyLoadingIds(new Set());
      return;
    }
    // Always force refresh when folder changes to avoid stale cached data
    if (controllerRef.current) {
      controllerRef.current.reset(folderId);
    }
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

        if (affectsEmail && folderIdRef.current && controllerRef.current) {
          console.log("[JmapPush] Refreshing message list head...");
          refreshPromises.push(
            (async () => {
              await controllerRef.current!.refreshHead();
              syncControllerState();
              console.log("[JmapPush] Message list head refreshed in", Math.round(performance.now() - startTime), "ms");
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
        // Store body content separately
        setMessageBodies((prev) => {
          const next = new Map(prev);
          next.set(targetMessageId, { html: resolved.html || undefined, text: body.text });
          return next;
        });
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
      if (!controllerRef.current) return;
      
      // Find the message and check if it's unread
      const state = controllerRef.current.getState();
      const item = state?.itemsById.get(targetMessageId);
      if (!item || !isUnread(item.keywords)) return;

      // Optimistically update local state
      controllerRef.current.updateItem(targetMessageId, (email) => ({
        ...email,
        keywords: { ...email.keywords, "$seen": true }
      }));
      syncControllerState();

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
      } else {
        // Revert on failure
        controllerRef.current.updateItem(targetMessageId, (email) => {
          const keywords = { ...email.keywords };
          delete keywords["$seen"];
          return { ...email, keywords };
        });
        syncControllerState();
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
      if (!controllerRef.current) return;
      
      const state = controllerRef.current.getState();
      const item = state?.itemsById.get(messageId);
      if (!item) return;
      const nextStarred = !isStarred(item.keywords);

      // Optimistic update.
      controllerRef.current.updateItem(messageId, (email) => ({
        ...email,
        keywords: { ...email.keywords, "$flagged": nextStarred ? true : undefined }
      }));
      syncControllerState();

      const ok = await setEmailStarred({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: messageId,
        starred: nextStarred
      });

      if (!ok) {
        // Revert on failure.
        controllerRef.current.updateItem(messageId, (email) => {
          const keywords = { ...email.keywords };
          if (nextStarred) {
            delete keywords["$flagged"];
          } else {
            keywords["$flagged"] = true;
          }
          return { ...email, keywords };
        });
        syncControllerState();
      }
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

  const rowActionsMessage = useMemo(() => {
    if (!rowActionsMessageId || !controllerState) return null;
    const item = controllerState.itemsById.get(rowActionsMessageId);
    if (!item) return null;
    const body = messageBodies.get(rowActionsMessageId);
    const msg = toMessage(item);
    if (body) {
      msg.html = body.html;
      msg.text = body.text;
    }
    return msg;
  }, [controllerState, rowActionsMessageId, messageBodies]);

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
      globalThis.alert(t("mail.downloadEmlFailed"));
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
            <span className={styles.srOnly}>{t("mail.search")}</span>
            <input
              className={styles.search}
              placeholder={t("mail.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${styles.searchBodyToggle} ${searchIncludeBody ? styles.searchBodyToggleActive : ""}`}
            title={t(searchIncludeBody ? "mail.searchingMessageTextDisable" : "mail.searchMessageText")}
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
                title={t("mail.clickToCopyEmail")}
                onClick={() => {
                  void globalThis.navigator?.clipboard?.writeText(signedInEmail);
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 1500);
                }}
              >
                {emailCopied ? t("mail.copiedToClipboard") : signedInEmail}
              </button>
            );
          })()}
          <ProfileMenu />
        </div>
      </header>

      <aside className={styles.sidebar} aria-label={t("mail.folders")}>
        <nav className={styles.folders} aria-label={t("mail.folders")}>
          <div className={styles.folderFilterRow}>
            <label className={styles.folderFilterLabel}>
              <span className={styles.srOnly}>{t("mail.findFolder")}</span>
              <input
                className={styles.folderFilter}
                value={folderQuery}
                placeholder={t("mail.findFolderPlaceholder")}
                onChange={(e) => setFolderQuery(e.target.value)}
              />
            </label>
          </div>

          <div
            className={styles.folderTree}
            role="tree"
            aria-label={t("mail.folders")}
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
                {t("mail.loadingFolders")}
              </div>
            ) : mailboxesError ? (
              <div className={styles.errorState} role="alert">
                {mailboxesError}{" "}
                <button type="button" className={styles.secondaryButton} onClick={() => void loadMailboxes({ force: true })}>
                  {t("common.retry")}
                </button>
              </div>
            ) : folders.length === 0 ? (
              <div className={styles.emptyState}>{t("mail.noFolders")}</div>
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
                              aria-label={t("mail.folderActionsName", { name: f.name })}
                              title={t("mail.folderActions")}
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
            <span>{t("mail.compose")}</span>
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
            title={t("mail.changeFolder")}
          >
            <span className={styles.folderSwitcherDuck} aria-hidden="true">
              🦆
            </span>
            <span className={styles.folderSwitcherName}>{folder.name}</span>
            <span className={styles.count}>({controllerState?.ids.length ?? 0})</span>
            <ChevronDown className={`${styles.icon} ${styles.folderSwitcherChevron}`} aria-hidden="true" />
          </button>
          <ProfileMenu />
        </div>

        <section
          className={styles.list}
          aria-label={t("mail.messageList")}
          style={{ position: "relative", height: "100%", overflow: "hidden" }}
        >
          {controllerState?.pendingNewCount && controllerState.pendingNewCount > 0 ? (
            <div style={{ padding: "8px", textAlign: "center" }}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  if (controllerRef.current) {
                    const firstVisibleId = controllerState?.ids[0] ?? null;
                    controllerRef.current.applyPendingNewMessages(firstVisibleId);
                    syncControllerState();
                    if (virtualListRef.current && firstVisibleId) {
                      const index = controllerState?.ids.indexOf(firstVisibleId) ?? 0;
                      virtualListRef.current.scrollToItem(index, "start");
                    }
                  }
                }}
              >
                {t("mail.newMessages", { count: controllerState.pendingNewCount })}
              </button>
            </div>
          ) : null}
          {messagesLoading && messages.length === 0 ? (
            <div className={styles.loadingState} aria-live="polite">
              <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
              {searchQuery.trim() ? t("mail.searching") : t("mail.loadingEmails")}
            </div>
          ) : messagesError ? (
            <div className={styles.errorState} role="alert">
              {messagesError}{" "}
              <button type="button" className={styles.secondaryButton} onClick={() => void loadMessages({ force: true })}>
                {t("common.retry")}
              </button>
            </div>
          ) : messages.length === 0 && !messagesLoading ? (
            <div className={styles.emptyState}>
              {searchQuery.trim()
                ? t("mail.noResultsForQuery", { query: searchQuery.trim() })
                : t("mail.noEmailsInFolder")}
            </div>
          ) : messages.length > 0 ? (
            <VariableSizeList
              ref={virtualListRef}
              height={isDesktop ? window.innerHeight - 150 : window.innerHeight - 200}
              itemCount={messages.length + (controllerState?.hasMore ? 1 : 0)}
              itemSize={(index) => {
                if (index >= messages.length) return 60; // Load more row
                const msg = messages[index];
                const isOpen = expandedMessageIds.has(msg.id);
                const cachedHeight = rowHeightsRef.current.get(msg.id);
                if (cachedHeight) return cachedHeight;
                // Conservative estimate; real height comes from measurement below.
                return isOpen ? 360 : defaultRowHeight;
              }}
              width="100%"
              onItemsRendered={({ visibleStopIndex }) => {
                // Infinite scroll: load more when near the end
                if (
                  controllerState &&
                  controllerState.hasMore &&
                  !controllerState.loadingNext &&
                  visibleStopIndex >= messages.length - 10
                ) {
                  if (controllerRef.current) {
                    void controllerRef.current.loadNextPage().then(() => {
                      syncControllerState();
                      if (virtualListRef.current) {
                        virtualListRef.current.resetAfterIndex(visibleStopIndex - 5);
                      }
                    });
                  }
                }
              }}
              style={{ outline: "none" }}
            >
              {({ index, style }) => {
                if (index >= messages.length) {
                  // Load more / loading / error row
                  return (
                    <div style={style}>
                      <div style={{ padding: "16px", textAlign: "center" }}>
                        {controllerState?.loadingNext ? (
                          <>
                            <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                            {t("mail.loadingMore")}
                          </>
                        ) : controllerState?.errorNext ? (
                          <>
                            <div>{controllerState.errorNext}</div>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => {
                                if (controllerRef.current) {
                                  void controllerRef.current.loadNextPage().then(() => syncControllerState());
                                }
                              }}
                            >
                              {t("common.retry")}
                            </button>
                          </>
                        ) : controllerState?.hasMore ? (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => {
                              if (controllerRef.current) {
                                void controllerRef.current.loadNextPage().then(() => syncControllerState());
                              }
                            }}
                          >
                            {t("mail.loadMore")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                }
                
                const msg = messages[index];
          return (
                  <div key={msg.id} style={style}>
                    <div
                      className={styles.rowWrapper}
                      ref={(el) => {
                        // IMPORTANT:
                        // - Measure the real row content (not the react-window wrapper which is forced to itemSize)
                        // - Use ResizeObserver because row height changes after render (CSS max-height transition, images, etc.)
                        const existingObserver = rowResizeObserversRef.current.get(msg.id);

                        if (!el) {
                          rowGroupRefs.current.delete(msg.id);
                          if (existingObserver) {
                            existingObserver.disconnect();
                            rowResizeObserversRef.current.delete(msg.id);
                          }
                          return;
                        }

                        rowGroupRefs.current.set(msg.id, el);

                        if (!existingObserver) {
                          const observer = new ResizeObserver(() => {
                            const measured = Math.ceil(el.getBoundingClientRect().height);
                            const current = rowHeightsRef.current.get(msg.id);
                            if (measured > 0 && current !== measured) {
                              rowHeightsRef.current.set(msg.id, measured);
                              virtualListRef.current?.resetAfterIndex(index);
                            }
                          });
                          observer.observe(el);
                          rowResizeObserversRef.current.set(msg.id, observer);
                        }

                        // Prime initial measurement immediately.
                        const measured = Math.ceil(el.getBoundingClientRect().height);
                        const current = rowHeightsRef.current.get(msg.id);
                        if (measured > 0 && current !== measured) {
                          rowHeightsRef.current.set(msg.id, measured);
                          virtualListRef.current?.resetAfterIndex(index);
                        }
                      }}
                    >
                      {(() => {
                      const isOpen = expandedMessageIds.has(msg.id);
                      const regionId = `message-body-${msg.id}`;
                      return (
                        <div className={`${styles.rowGroup} ${isOpen ? styles.rowGroupOpen : ""}`}>
              <div
                className={`${styles.row} ${canDragEmails ? styles.rowDraggable : ""} ${isOpen ? styles.rowOpen : ""}`}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-controls={regionId}
                aria-label={t("mail.openMessage", { subject: msg.subject })}
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
                  <div className={styles.bimi} data-col="icon" aria-hidden="true" title="BIMI">
                    {(() => {
                      const senderEmail = msg.fromRaw?.[0]?.email;
                      const domain = senderEmail ? normalizeBimiDomainKey(senderEmail) : null;
                      const logoUrl = domain ? bimiLogos.get(domain) : null;
                      if (logoUrl) {
                        return <img src={logoUrl} alt="" className={styles.bimiLogo} />;
                      }
                      return getBimiInitial(formatSenderForList(msg.fromRaw) || msg.from);
                    })()}
                  </div>
                  <div className={`${styles.from} ${msg.unread ? styles.unreadText : ""}`} data-col="from">
                    {formatSenderForList(msg.fromRaw) || "(no sender)"}
                  </div>
                  <div className={styles.summary} data-col="subject">
                    <span className={`${styles.subject} ${msg.unread ? styles.unreadText : ""}`}>{msg.subject}</span>
                    {msg.preview && (
                      <>
                        <span className={styles.summarySep}> — </span>
                        <span className={styles.preview}>{msg.preview}</span>
                      </>
                    )}
                  </div>
                  <div className={`${styles.rightCell} ${isOpen ? styles.rightCellExpanded : ""}`} data-col="date" onClick={(e) => e.stopPropagation()}>
                    <div className={styles.rightMeta}>
                      <div className={styles.date} title={new Date(msg.receivedAt).toLocaleString()}>
                        {formatListArrivalTime(msg.receivedAt)}
                      </div>
                      {msg.hasAttachments && (
                        <div
                          className={styles.attachmentIndicator}
                          aria-label={t("mail.hasAttachments")}
                          title={t("mail.hasAttachments")}
                        >
                          <Paperclip className={styles.icon} aria-hidden="true" />
                        </div>
                      )}
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.moreButton}`}
                        aria-label={t("mail.moreActionsSubject", { subject: msg.subject })}
                        title={t("mail.moreActions")}
                        onClick={() => setRowActionsMessageId(msg.id)}
                      >
                        <MoreHorizontal className={styles.icon} aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.mobileActionButton}
                      aria-label={t("mail.moreActionsSubject", { subject: msg.subject })}
                      title={t("mail.moreActions")}
                      onClick={() => setRowActionsMessageId(msg.id)}
                    >
                      <MoreHorizontal className={styles.icon} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div
                id={regionId}
                data-testid={regionId}
                className={`${styles.expanded} ${isOpen ? styles.expandedOpen : ""}`}
                role="region"
                aria-label={t("mail.messageRegion", { subject: msg.subject })}
                aria-hidden={!isOpen}
                {...(!isOpen ? ({ inert: "" } as unknown as HTMLAttributes<HTMLDivElement>) : {})}
              >
                <div className={styles.expandedMeta}>
                  <div>
                    <span className={styles.metaLabel}>{t("mail.from")}:</span> {msg.from}
                  </div>
                  <div>
                    <span className={styles.metaLabel}>{t("mail.received")}:</span> {new Date(msg.receivedAt).toLocaleString()}
                  </div>
                </div>

                <div className={styles.expandedSecondRow}>
                  <button
                    type="button"
                    className={styles.toLineButton}
                    title={t(expandedToIds.has(msg.id) ? "mail.hideFullToHeader" : "mail.showFullToHeader")}
                    onClick={() =>
                      setExpandedToIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(msg.id)) next.delete(msg.id);
                        else next.add(msg.id);
                        return next;
                      })
                    }
                  >
                    <span className={styles.metaLabel}>{t("mail.to")}:</span> {expandedToIds.has(msg.id) ? msg.to : activeProfileName}
                  </button>
                  <div className={styles.downloadRow}>
                    {msg.attachments.length > 0 && (
                      <button
                        type="button"
                        className={styles.attachmentsToggle}
                        aria-label={t("mail.toggleAttachmentsSubject", { subject: msg.subject })}
                        aria-expanded={expandedAttachmentIds.has(msg.id)}
                        aria-controls={`attachments-${msg.id}`}
                        title={t("mail.toggleAttachments")}
                        onClick={() => toggleAttachments(msg.id)}
                      >
                        <Paperclip className={styles.icon} aria-hidden="true" />
                        <span className={styles.attachmentsToggleLabel}>{t("mail.attachments")}</span>
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
                    aria-label={t("mail.attachments")}
                    hidden={!expandedAttachmentIds.has(msg.id)}
                  >
                    {msg.attachments.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={styles.attachmentChip}
                        title={t("mail.downloadAttachment")}
                        aria-label={t("mail.downloadAttachmentName", { name: a.name })}
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
                    {t("mail.loadingMessage")}
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
                    })()}
                    </div>
                  </div>
                );
              }}
            </VariableSizeList>
          ) : null}
        </section>

        <footer className={styles.appFooter}>
          <div className={styles.footerQuota}>
            {quotaLoading ? (
              <span className={styles.footerQuotaLoading}>{t("common.loading")}</span>
            ) : quotaError ? (
              <span className={styles.footerQuotaMuted} title={quotaError}>
                {t("mail.quotaUnavailable")}
              </span>
            ) : (() => {
              if (quotas.length === 0) {
                return <span className={styles.footerQuotaMuted}>{t("mail.quotaNotConfigured")}</span>;
              }
              const storageQuota = quotas.find((q) => q.resourceType === "octets");
              if (!storageQuota) {
                const types = Array.from(new Set(quotas.map((q) => q.resourceType))).join(", ");
                return (
                  <span
                    className={styles.footerQuotaMuted}
                    title={t("mail.availableQuotaResourceTypes", { types: types || t("common.none") })}
                  >
                    {t("mail.storageQuotaUnavailable")}
                  </span>
                );
              }
              const limitText = storageQuota.hardLimit ? formatQuotaBytes(storageQuota.hardLimit) : t("common.unlimited");
              return (
                <span className={styles.footerQuotaItem}>
                  {t("mail.spaceUsed", { used: formatQuotaBytes(storageQuota.used), limit: limitText })}
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
          aria-label={t("mail.messageActions")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRowActionsMessageId(null);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>{t("mail.actions")}</div>
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
                  {t("mail.reply")}
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
                  {t("mail.forward")}
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
                  {rowActionsMessage.starred ? t("mail.unstar") : t("mail.star")}
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
                  {rowActionsMessage.unread ? t("mail.markRead") : t("mail.markUnread")}
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                title={!rowActionsMessage.blobId ? t("mail.sourceUnavailable") : t("mail.downloadAsEml")}
                disabled={!auth || !rowActionsMessage.blobId}
                onClick={() => {
                  void downloadEml(rowActionsMessage);
                  setRowActionsMessageId(null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <FileDown className={styles.icon} aria-hidden="true" />
                  {t("mail.downloadSourceEml")}
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
                  {t("common.delete")}
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
          aria-label={t("mail.folderActions")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFolderActionsFolderId(null);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>{t("mail.actions")}</div>
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
                  {t("mail.newSubfolder")}
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                disabled={folderActionsIsSystemFolder}
                title={t(folderActionsIsSystemFolder ? "mail.systemFolderCannotBeRenamed" : "mail.renameFolder")}
                onClick={() => {
                  const id = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  openRenameFolder(id);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Pencil className={styles.icon} aria-hidden="true" />
                  {t("mail.rename")}
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                disabled={folderActionsIsSystemFolder || folderActionsHasChildren}
                title={
                  folderActionsIsSystemFolder
                    ? t("mail.systemFolderCannotBeDeleted")
                    : folderActionsHasChildren
                      ? t("mail.deleteSubfoldersFirst")
                      : t("mail.deleteFolder")
                }
                onClick={() => {
                  const id = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  openDeleteFolder(id);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <Trash2 className={styles.icon} aria-hidden="true" />
                  {t("common.delete")}
                </span>
              </button>

              <button
                className={styles.sendMenuItem}
                type="button"
                disabled={folderActionsIsSystemFolder}
                title={t(folderActionsIsSystemFolder ? "mail.systemFolderCannotBeMoved" : "mail.moveToRoot")}
                onClick={() => {
                  const id = folderActionsFolderId;
                  setFolderActionsFolderId(null);
                  void performMoveFolder(id, null);
                }}
              >
                <span className={styles.sendMenuItemRow}>
                  <ChevronDown className={styles.icon} aria-hidden="true" />
                  {t("mail.moveToRoot")}
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
                  {t("mail.newFolderRoot")}
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
          aria-label={t(composeMinimized ? "mail.resumeDraft" : "mail.compose")}
          title={t(composeMinimized ? "mail.resumeDraft" : "mail.compose")}
          onClick={() => {
            if (composeMinimized) resumeCompose();
            else beginCompose({ to: "", subject: "", body: "" });
          }}
        >
          <Pencil className={`${styles.icon} ${styles.composeDockIcon}`} aria-hidden="true" />
          <span className={styles.composeDockLabel}>{t(composeMinimized ? "mail.resume" : "mail.compose")}</span>
          {composeMinimized && <span className={styles.composeDockDraftPill}>{t("mail.draftCount", { count: 1 })}</span>}
        </button>
      )}

      {folderPickerOpen && (
        <div
          id="folder-picker"
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("mail.chooseFolder")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFolderPickerOpen(false);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>{t("mail.folders")}</div>
            </div>

            <div className={styles.sheetBody}>
              <div className={styles.folderFilterRow}>
                <label className={styles.folderFilterLabel}>
                  <span className={styles.srOnly}>{t("mail.findFolder")}</span>
                  <input
                    className={styles.folderFilter}
                    value={folderQuery}
                    placeholder={t("mail.findFolderPlaceholder")}
                    onChange={(e) => setFolderQuery(e.target.value)}
                  />
                </label>
              </div>

              <div
                className={styles.folderTree}
                role="tree"
                aria-label={t("mail.folders")}
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
                    {t("mail.loadingFolders")}
                  </div>
                ) : mailboxesError ? (
                  <div className={styles.errorState} role="alert">
                    {mailboxesError}{" "}
                    <button type="button" className={styles.secondaryButton} onClick={() => void loadMailboxes({ force: true })}>
                      {t("common.retry")}
                    </button>
                  </div>
                ) : folders.length === 0 ? (
                  <div className={styles.emptyState}>{t("mail.noFolders")}</div>
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
          aria-label={t("mail.composeEmail")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) minimizeCompose();
          }}
        >
          <div className={styles.modal} role="document">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>{t("mail.newEmail")}</div>
            </div>

            <div className={styles.modalBody}>
              {composeError && (
                <div className={styles.errorState} role="alert" style={{ marginBottom: 10 }}>
                  {composeError}
                </div>
              )}
              <div className={styles.field}>
                <div className={styles.fieldHeaderRow}>
                  <div className={styles.fieldLabel}>{t("mail.from")}</div>
                  {isDesktop && activeProfileName.trim() !== "" && (
                    <div className={styles.fieldHint} title={t("profile.profile")}>
                      {activeProfileName}
                    </div>
                  )}
                </div>
                <input
                  className={styles.input}
                  type="email"
                  placeholder={t("mail.senderPlaceholder")}
                  value={composeDraft.from}
                  disabled={composeBusy}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, from: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldHeaderRow}>
                  <div className={styles.fieldLabel}>{t("mail.to")}</div>
                  {isDesktop && (
                    <div className={styles.fieldActions}>
                      <button
                        type="button"
                        className={styles.miniToggle}
                        aria-pressed={composeShowCc}
                        title={t("mail.addCc")}
                        onClick={() => setComposeShowCc((v) => !v)}
                        disabled={composeBusy}
                      >
                        CC
                      </button>
                      <button
                        type="button"
                        className={styles.miniToggle}
                        aria-pressed={composeShowBcc}
                        title={t("mail.addBcc")}
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
                  placeholder={t("mail.recipientPlaceholder")}
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
                    placeholder={t("mail.ccPlaceholder")}
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
                    placeholder={t("mail.bccPlaceholder")}
                    value={composeDraft.bcc}
                    disabled={composeBusy}
                    onChange={(e) => setComposeDraft((prev) => ({ ...prev, bcc: e.target.value }))}
                  />
                </label>
              )}
              <label className={styles.field}>
                {t("mail.subject")}
                <input
                  className={styles.input}
                  type="text"
                  placeholder={t("mail.subjectPlaceholder")}
                  value={composeDraft.subject}
                  disabled={composeBusy}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, subject: e.target.value }))}
                />
              </label>

              {scheduleEnabled && (
                <label className={styles.field}>
                  {t("mail.scheduledFor")}
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
                <div className={styles.fieldLabel}>{t("mail.message")}</div>
                <ComposeEditor
                  valueHtml={composeDraft.body}
                  onChangeHtml={(next) => setComposeDraft((prev) => ({ ...prev, body: next }))}
                  onInlineImage={({ cid, file }) => setInlineImagesByCid((prev) => ({ ...prev, [cid]: file }))}
                  placeholder={t("mail.writeMessagePlaceholderLong")}
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
                <div className={styles.attachmentsSection} aria-label={t("mail.attachments")}>
                  <div className={styles.attachmentsHeader}>{t("mail.attachments")}</div>
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
                          aria-label={t("common.removeName", { name: f.name })}
                          title={t("common.remove")}
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
                  {t("common.cancel")}
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  title={t("mail.attachFile")}
                  aria-label={t("mail.attachFile")}
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
                    {composeBusy ? t("mail.sending") : scheduleEnabled ? t("mail.scheduleSend") : t("mail.send")}
                  </button>
                  <button
                    className={styles.splitToggle}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={sendMenuOpen}
                    aria-label={t("mail.moreSendOptions")}
                    title={t("mail.moreSendOptions")}
                    disabled={composeBusy}
                    onClick={() => setSendMenuOpen((v) => !v)}
                  >
                    <ChevronDown className={styles.icon} aria-hidden="true" />
                  </button>

                  {sendMenuOpen && (
                    <div className={styles.sendMenu} role="menu" aria-label={t("mail.sendOptions")}>
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
                          {composeBusy ? t("mail.saving") : t("mail.saveAsDraft")}
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
                            {t("mail.scheduleDelivery")}
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
          aria-label={t("mail.saveDraft")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setComposeCancelConfirmOpen(false);
          }}
        >
          <div className={styles.confirmModal} role="document">
            <div className={styles.confirmTitle}>{t("mail.saveDraftPrompt")}</div>
            <div className={styles.confirmBody}>{t("mail.saveDraftBody")}</div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.dangerAction}`}
                onClick={() => {
                  setComposeCancelConfirmOpen(false);
                  discardCompose();
                }}
              >
                {t("common.discard")}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setComposeCancelConfirmOpen(false)}
              >
                {t("common.continueEditing")}
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
                {t("mail.saveDraft")}
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
            folderOpMode === "create"
              ? t("mail.createFolder")
              : folderOpMode === "rename"
                ? t("mail.renameFolder")
                : t("mail.deleteFolder")
          }
          onMouseDown={(e) => {
            if (folderOpBusy) return;
            if (e.target === e.currentTarget) closeFolderOp();
          }}
        >
          <div className={styles.folderOpModal} role="document">
            <div className={styles.confirmTitle}>
              {folderOpMode === "create"
                ? t("mail.newFolder")
                : folderOpMode === "rename"
                  ? t("mail.renameFolder")
                  : t("mail.deleteFolder")}
            </div>

            {folderOpError && (
              <div className={styles.folderOpError} role="alert">
                {folderOpError}
              </div>
            )}

            {folderOpMode === "delete" ? (
              <div className={styles.confirmBody}>
                {t("mail.delete")}{" "}
                <strong>{folderIndex.byId.get(folderOpTargetId ?? "")?.name ?? t("mail.thisFolder")}</strong>
                {t("mail.deleteFolderConfirmSuffix")}
              </div>
            ) : (
              <div className={styles.folderOpForm}>
                {folderOpMode === "create" && (
                  <label className={styles.folderOpField}>
                    <span className={styles.folderOpLabel}>{t("mail.parent")}</span>
                    <select
                      className={styles.input}
                      value={folderOpParentId ?? ""}
                      onChange={(e) => setFolderOpParentId(e.target.value === "" ? null : e.target.value)}
                      disabled={folderOpBusy}
                    >
                      <option value="">{t("mail.root")}</option>
                      {folderOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {`${"— ".repeat(o.depth)}${o.label}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className={styles.folderOpField}>
                  <span className={styles.folderOpLabel}>{t("common.name")}</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={folderOpName}
                    onChange={(e) => setFolderOpName(e.target.value)}
                    placeholder={folderOpMode === "create" ? t("mail.folderNameExample") : undefined}
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
                {t("common.cancel")}
              </button>
              {folderOpMode === "delete" ? (
                <button
                  type="button"
                  className={`${styles.secondaryButton} ${styles.dangerAction}`}
                  onClick={() => void submitFolderOp()}
                  disabled={folderOpBusy}
                >
                  {folderOpBusy ? t("mail.deleting") : t("common.delete")}
                </button>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={() => void submitFolderOp()} disabled={folderOpBusy}>
                  {folderOpMode === "create"
                    ? folderOpBusy
                      ? t("mail.creating")
                      : t("mail.create")
                    : folderOpBusy
                      ? t("mail.saving")
                      : t("common.save")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
