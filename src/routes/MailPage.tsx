import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileDown,
  Forward,
  LoaderCircle,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Reply,
  Save,
  Star,
  Trash2,
  X
} from "lucide-react";

import ThemeToggle from "../theme/ThemeToggle";
import ProfileMenu from "../shared/ProfileMenu";
import SafeEmailViewer from "../shared/SafeEmailViewer";
import ComposeEditor from "../shared/ComposeEditor";
import { useAuth } from "../auth/AuthContext";
import { getMailboxes, type JmapMailbox } from "../jmap/mailbox";
import styles from "./mail.module.css";

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
  attachments: Attachment[];
  rawSource: string;
  html?: string;
  text?: string;
};

type Profile = { id: string; name: string };
const STORAGE_ACTIVE_PROFILE = "activeProfileId";
const STORAGE_PROFILES = "profiles";

function readProfiles(): Profile[] {
  const raw = localStorage.getItem(STORAGE_PROFILES);
  if (!raw) return [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
    const normalized = parsed
      .map((p) => (typeof p === "object" && p ? (p as { id?: unknown; name?: unknown }) : null))
      .filter(Boolean)
      .map((p) => ({ id: String(p!.id ?? ""), name: String(p!.name ?? "") }))
      .filter((p) => p.id.length > 0 && p.name.length > 0);
    return normalized.length > 0 ? normalized : [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
  } catch {
    return [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
  }
}

function readActiveProfileName(): string {
  const profiles = readProfiles();
  const raw = localStorage.getItem(STORAGE_ACTIVE_PROFILE);
  const active = raw && profiles.some((p) => p.id === raw) ? raw : profiles[0]?.id ?? "personal";
  return profiles.find((p) => p.id === active)?.name ?? "Personal";
}

function sortMailboxes(a: JmapMailbox, b: JmapMailbox): number {
  const sa = a.sortOrder ?? 0;
  const sb = b.sortOrder ?? 0;
  if (sa !== sb) return sa - sb;
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

const demoMessages: Message[] = [
  {
    id: "m1",
    from: "Alice <alice@example.com>",
    to: "You <you@duckwebmail.local>",
    subject: "Welcome",
    preview: "Welcome to RayMap Webmail — this is a demo message.",
    receivedAt: new Date().toISOString(),
    unread: true,
    starred: false,
    attachments: [
      {
        id: "a1",
        name: "welcome.txt",
        sizeBytes: 1536,
        contentType: "text/plain",
        content: "Welcome to Duckwebmail!\n\nThis is a demo attachment.\n"
      }
    ],
    rawSource: [
      "From: Alice <alice@example.com>",
      "To: You <you@duckwebmail.local>",
      "Subject: Welcome",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p><strong>Welcome</strong> to RayMap Webmail.</p><p>This expands inline as a full-width row.</p>"
    ].join("\n"),
    html: "<p><strong>Welcome</strong> to RayMap Webmail.</p><p>This expands inline as a full-width row.</p>"
  },
  {
    id: "m2",
    from: "Billing <billing@example.com>",
    to: "You <you@duckwebmail.local>",
    subject: "Invoice #1234",
    preview: "Your invoice is ready. Please review.",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    unread: false,
    starred: false,
    attachments: [
      {
        id: "a2",
        name: "invoice-1234.pdf",
        sizeBytes: 293_481,
        contentType: "application/pdf",
        content: "%PDF-1.4\n% Demo PDF content placeholder\n"
      }
    ],
    rawSource: [
      "From: Billing <billing@example.com>",
      "To: You <you@duckwebmail.local>",
      "Subject: Invoice #1234",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Invoice #1234",
      "",
      "This is a plain text email demo."
    ].join("\n"),
    text: "Invoice #1234\n\nThis is a plain text email demo."
  }
];

type ComposeDraft = {
  to: string;
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

export default function MailPage() {
  const navigate = useNavigate();
  const { auth, signOut } = useAuth();
  const sendMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const scheduledForInputRef = useRef<HTMLInputElement | null>(null);
  const [folderId, setFolderId] = useState<string>("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(() => new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeCancelConfirmOpen, setComposeCancelConfirmOpen] = useState(false);
  const [rowActionsMessageId, setRowActionsMessageId] = useState<string | null>(null);
  const [expandedToIds, setExpandedToIds] = useState<Set<string>>(() => new Set());
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({ to: "", subject: "", body: "" });
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [messages, setMessages] = useState<Message[]>(() => demoMessages);
  const activeProfileName = useMemo(() => readActiveProfileName(), []);

  const [mailboxesLoading, setMailboxesLoading] = useState(false);
  const [mailboxesError, setMailboxesError] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<JmapMailbox[]>([]);

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
    const byId = new Map<string, Folder>();
    const childrenByParent = new Map<string | null, Folder[]>();
    for (const f of folders) {
      byId.set(f.id, f);
      const parentKey = f.parentId ?? null;
      const list = childrenByParent.get(parentKey) ?? [];
      list.push(f);
      childrenByParent.set(parentKey, list);
    }
    for (const [, list] of childrenByParent) list.sort((a, b) => a.name.localeCompare(b.name));
    return { byId, childrenByParent };
  }, [folders]);

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
  }, [folderIndex.byId, normalizedFolderQuery]);

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
  const hasDraft = useMemo(() => composeMinimized, [composeMinimized]);
  const isComposeDirty = useMemo(() => {
    if (composeDraft.to.trim() !== "") return true;
    if (composeDraft.subject.trim() !== "") return true;
    if (composeDraft.body.trim() !== "") return true;
    if (attachments.length > 0) return true;
    if (scheduleEnabled) return true;
    return false;
  }, [attachments.length, composeDraft.body, composeDraft.subject, composeDraft.to, scheduleEnabled]);

  useEffect(() => {
    // Switching folder should never keep old expanded state around.
    setExpandedIds(new Set());
    setExpandedAttachmentIds(new Set());
  }, [folderId]);

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
    setComposeDraft({
      to: draft?.to ?? "",
      subject: draft?.subject ?? "",
      body: draft?.body ? plainTextToHtml(draft.body) : ""
    });
    setScheduleEnabled(false);
    setScheduledFor("");
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setAttachments([]);
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
    setComposeDraft({ to: "", subject: "", body: "" });
    setScheduleEnabled(false);
    setScheduledFor("");
    setAttachments([]);
  };

  const toggleExpanded = (messageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
        setExpandedAttachmentIds((prevAttachments) => {
          const nextAttachments = new Set(prevAttachments);
          nextAttachments.delete(messageId);
          return nextAttachments;
        });
      } else next.add(messageId);
      return next;
    });
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
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred: !m.starred } : m)));
  };

  const toggleUnread = (messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, unread: !m.unread } : m)));
  };

  const deleteMessage = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
    setRowActionsMessageId((prev) => (prev === messageId ? null : prev));
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

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Folders">
        <div className={styles.brandRow}>
          <button
            type="button"
            className={styles.brand}
            onClick={() => setFolderPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={folderPickerOpen}
            aria-controls="folder-picker"
            title="Change folder"
          >
            <span className={styles.brandDuck} aria-hidden="true">
              🦆
            </span>
            <span className={styles.brandName}>{folder.name}</span>
            <ChevronDown className={`${styles.icon} ${styles.brandChevron}`} aria-hidden="true" />
          </button>
          <div className={styles.sidebarActions}>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </div>

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

          <div className={styles.folderTree} role="tree" aria-label="Folders">
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
                        <button
                          type="button"
                          role="treeitem"
                          aria-level={depth + 1}
                          aria-expanded={hasChildren ? isOpen : undefined}
                          className={`${styles.folderItem} ${active ? styles.folderItemActive : ""}`}
                          onClick={() => setFolderId(f.id)}
                          aria-current={active ? "page" : undefined}
                        >
                          <span className={styles.folderLabel} style={{ paddingLeft: `${10 + depth * 14}px` }}>
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
                            <span className={styles.folderDuck} aria-hidden="true">
                              🦆
                            </span>
                            <span className={styles.folderNameText}>{f.name}</span>
                          </span>
                          {f.unread > 0 && <span className={styles.unreadPill}>{f.unread}</span>}
                        </button>

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
            className={styles.logout}
            type="button"
            onClick={() => {
              signOut();
              navigate("/login");
            }}
          >
            ← Sign out
          </button>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.currentFolder}>
              {folder.name} <span className={styles.count}>({messages.length})</span>
            </div>

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
              <span className={styles.count}>({messages.length})</span>
              <ChevronDown className={`${styles.icon} ${styles.folderSwitcherChevron}`} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.topbarCenter}>
            <label className={styles.searchLabel}>
              <span className={styles.srOnly}>Search</span>
              <input className={styles.search} placeholder="Search mail…" />
            </label>
          </div>

          <div className={styles.topbarRight}>
            <div className={styles.topbarTools}>
              <ProfileMenu />
            </div>
            <button
              className={styles.composeButton}
              type="button"
              onClick={() => {
                if (composeMinimized) resumeCompose();
                else beginCompose({ to: "", subject: "", body: "" });
              }}
            >
              <span className={styles.composeButtonLabel}>Compose</span>
              {hasDraft && <span className={styles.draftPill}>Draft: 1</span>}
            </button>
          </div>
        </header>

        <section className={styles.list} aria-label="Message list">
        {messages.map((msg) => {
          const isOpen = expandedIds.has(msg.id);
          const regionId = `message-body-${msg.id}`;
          return (
            <div key={msg.id} className={`${styles.rowGroup} ${isOpen ? styles.rowGroupOpen : ""}`}>
              <div
                className={`${styles.row} ${isOpen ? styles.rowOpen : ""}`}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-controls={regionId}
                aria-label={`Open ${msg.subject}`}
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
                        {msg.attachments.length > 0 && (
                          <div
                            className={styles.attachmentIndicator}
                            aria-label={`${msg.attachments.length} attachment${msg.attachments.length === 1 ? "" : "s"}`}
                            title={`${msg.attachments.length} attachment${msg.attachments.length === 1 ? "" : "s"}`}
                          >
                            <Paperclip className={styles.icon} aria-hidden="true" />
                            <span className={styles.attachmentIndicatorCount}>{msg.attachments.length}</span>
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
                className={styles.expanded}
                role="region"
                aria-label={`Message ${msg.subject}`}
                hidden={!isOpen}
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

                <SafeEmailViewer htmlContent={msg.html ?? ""} textContent={msg.text ?? ""} />
              </div>
            </div>
          );
        })}
        </section>
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
                onClick={() => {
                  triggerDownload(`${rowActionsMessage.subject}.eml`, "message/rfc822", rowActionsMessage.rawSource);
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

              <div className={styles.folderTree} role="tree" aria-label="Folders">
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
                            <button
                              type="button"
                              role="treeitem"
                              aria-level={depth + 1}
                              aria-expanded={hasChildren ? isOpen : undefined}
                              className={`${styles.sheetFolderItem} ${active ? styles.sheetFolderItemActive : ""}`}
                              onClick={() => setFolderId(f.id)}
                              aria-current={active ? "page" : undefined}
                            >
                              <span className={styles.folderLabel} style={{ paddingLeft: `${10 + depth * 14}px` }}>
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
                                <span className={styles.folderDuck} aria-hidden="true">
                                  🦆
                                </span>
                                <span className={styles.folderNameText}>{f.name}</span>
                              </span>
                              {f.unread > 0 && <span className={styles.unreadPill}>{f.unread}</span>}
                            </button>

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
              <label className={styles.field}>
                To
                <input
                  className={styles.input}
                  type="email"
                  placeholder="recipient@example.com"
                  value={composeDraft.to}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, to: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                Subject
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Subject"
                  value={composeDraft.subject}
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
                    onChange={(e) => setScheduledFor(e.target.value)}
                  />
                </label>
              )}
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Message</div>
                <ComposeEditor
                  valueHtml={composeDraft.body}
                  onChangeHtml={(next) => setComposeDraft((prev) => ({ ...prev, body: next }))}
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
                    onClick={() => {
                      discardCompose();
                    }}
                  >
                    {scheduleEnabled ? "Schedule send" : "Send"}
                  </button>
                  <button
                    className={styles.splitToggle}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={sendMenuOpen}
                    aria-label="More send options"
                    title="More send options"
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
                        onClick={() => {
                          setSendMenuOpen(false);
                          minimizeCompose();
                        }}
                      >
                        <span className={styles.sendMenuItemRow}>
                          <Save className={styles.icon} aria-hidden="true" />
                          Save as draft
                        </span>
                      </button>
                      {scheduleEnabled && (
                        <button
                          className={styles.sendMenuItem}
                          type="button"
                          role="menuitem"
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
                onClick={() => {
                  setComposeCancelConfirmOpen(false);
                  minimizeCompose();
                }}
              >
                Save draft
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
