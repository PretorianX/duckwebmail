import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileDown,
  Forward,
  Mail,
  MailOpen,
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
import styles from "./mail.module.css";

type Mailbox = { id: string; name: string; unread: number };
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

const demoMailboxes: Mailbox[] = [
  { id: "inbox", name: "Inbox", unread: 3 },
  { id: "archive", name: "Archive", unread: 0 },
  { id: "sent", name: "Sent", unread: 0 }
];

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
  body: string;
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

export default function MailPage() {
  const navigate = useNavigate();
  const sendMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const scheduledForInputRef = useRef<HTMLInputElement | null>(null);
  const [mailboxId, setMailboxId] = useState(demoMailboxes[0].id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(() => new Set());
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [mailboxPickerOpen, setMailboxPickerOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({ to: "", subject: "", body: "" });
  const [savedDraft, setSavedDraft] = useState<ComposeDraft | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [messages, setMessages] = useState<Message[]>(() => demoMessages);

  const mailbox = useMemo(() => demoMailboxes.find((m) => m.id === mailboxId)!, [mailboxId]);

  useEffect(() => {
    // Switching mailbox should never keep old expanded state around.
    setExpandedIds(new Set());
    setExpandedAttachmentIds(new Set());
  }, [mailboxId]);

  useEffect(() => {
    // Always close the picker after selecting a mailbox.
    setMailboxPickerOpen(false);
  }, [mailboxId]);

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

  const openCompose = (draft?: Partial<ComposeDraft>) => {
    setComposeDraft((prev) => ({
      to: draft?.to ?? prev.to,
      subject: draft?.subject ?? prev.subject,
      body: draft?.body ?? prev.body
    }));
    setScheduleEnabled(false);
    setScheduledFor("");
    setSendMenuOpen(false);
    setAttachments([]);
    setComposeOpen(true);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setSendMenuOpen(false);
    setScheduleEnabled(false);
    setScheduledFor("");
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
  };

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
      <aside className={styles.sidebar} aria-label="Mailboxes">
        <div className={styles.brandRow}>
          <button
            type="button"
            className={styles.brand}
            onClick={() => setMailboxPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mailboxPickerOpen}
            aria-controls="mailbox-picker"
            title="Change mailbox"
          >
            <span className={styles.brandDuck} aria-hidden="true">
              🦆
            </span>
            <span className={styles.brandName}>{mailbox.name}</span>
            <ChevronDown className={`${styles.icon} ${styles.brandChevron}`} aria-hidden="true" />
          </button>
          <div className={styles.sidebarActions}>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </div>

        <nav className={styles.mailboxes}>
          {demoMailboxes.map((m) => {
            const active = m.id === mailboxId;
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.mailboxItem} ${active ? styles.mailboxItemActive : ""}`}
                onClick={() => setMailboxId(m.id)}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.mailboxName}>
                  <span className={styles.mailboxDuck} aria-hidden="true">
                    🦆
                  </span>{" "}
                  {m.name}
                </span>
                {m.unread > 0 && <span className={styles.unreadPill}>{m.unread}</span>}
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.logout} type="button" onClick={() => navigate("/login")}>
            ← Sign out
          </button>
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.currentMailbox}>
              {mailbox.name} <span className={styles.count}>({messages.length})</span>
            </div>

            <button
              type="button"
              className={styles.mailboxSwitcher}
              onClick={() => setMailboxPickerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={mailboxPickerOpen}
              aria-controls="mailbox-picker"
              title="Change mailbox"
            >
              <span className={styles.mailboxSwitcherDuck} aria-hidden="true">
                🦆
              </span>
              <span className={styles.mailboxSwitcherName}>{mailbox.name}</span>
              <span className={styles.count}>({messages.length})</span>
              <ChevronDown className={`${styles.icon} ${styles.mailboxSwitcherChevron}`} aria-hidden="true" />
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
            <button className={styles.composeButton} type="button" onClick={() => openCompose({ to: "", subject: "", body: "" })}>
              Compose
            </button>
          </div>
        </header>

        <section className={styles.list} aria-label="Message list">
          <div className={styles.listHeader}>
            <div className={styles.listTitle}>
              <span className={styles.listTitleDuck} aria-hidden="true">
                🦆
              </span>{" "}
              {mailbox.name}
            </div>
          </div>

        {messages.map((msg) => {
          const isOpen = expandedIds.has(msg.id);
          const regionId = `message-body-${msg.id}`;
          const showActions = hoveredMessageId === msg.id || focusedMessageId === msg.id;
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
                onMouseOver={() => setHoveredMessageId(msg.id)}
                onMouseOut={(e) => {
                  const related = e.relatedTarget;
                  if (related === null) return;
                  if (related instanceof Node && e.currentTarget.contains(related)) return;
                  setHoveredMessageId((prev) => (prev === msg.id ? null : prev));
                }}
                onFocusCapture={() => {
                  setFocusedMessageId(msg.id);
                  setHoveredMessageId(msg.id);
                }}
                onBlurCapture={(e) => {
                  const related = e.relatedTarget;
                  if (!(related instanceof Node)) {
                    setFocusedMessageId((prev) => (prev === msg.id ? null : prev));
                    return;
                  }
                  if (!e.currentTarget.contains(related)) {
                    setFocusedMessageId((prev) => (prev === msg.id ? null : prev));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpanded(msg.id);
                  }
                }}
              >
                <div className={styles.rowGrid}>
                  <div className={`${styles.from} ${msg.unread ? styles.unreadText : ""}`}>{msg.from}</div>
                  <div className={styles.summary}>
                    <span className={`${styles.subject} ${msg.unread ? styles.unreadText : ""}`}>{msg.subject}</span>
                    <span className={styles.summarySep} aria-hidden="true">
                      {" "}
                      —{" "}
                    </span>
                    <span className={styles.preview}>{msg.preview}</span>
                  </div>
                  <div className={styles.rightCell} onClick={(e) => e.stopPropagation()}>
                    {showActions ? (
                      <div className={styles.actions} aria-label={`Actions ${msg.subject}`}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Reply ${msg.subject}`}
                          title="Reply"
                          onClick={() => {
                            setHoveredMessageId(msg.id);
                            setFocusedMessageId(msg.id);
                            openCompose({ to: msg.from, subject: `Re: ${msg.subject}`, body: "" });
                          }}
                        >
                          <Reply className={styles.icon} aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Forward ${msg.subject}`}
                          title="Forward"
                          onClick={() => {
                            setHoveredMessageId(msg.id);
                            setFocusedMessageId(msg.id);
                            openCompose({ to: "", subject: `Fwd: ${msg.subject}`, body: msg.text ?? "" });
                          }}
                        >
                          <Forward className={styles.icon} aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          className={`${styles.iconButton} ${msg.starred ? styles.iconButtonActive : ""}`}
                          aria-label={`${msg.starred ? "Unstar" : "Star"} ${msg.subject}`}
                          title={msg.starred ? "Unstar" : "Star"}
                          onClick={() => {
                            setHoveredMessageId(msg.id);
                            setFocusedMessageId(msg.id);
                            toggleStar(msg.id);
                          }}
                        >
                          <Star className={styles.icon} aria-hidden="true" fill={msg.starred ? "currentColor" : "none"} />
                        </button>

                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Mark ${msg.unread ? "read" : "unread"} ${msg.subject}`}
                          title={msg.unread ? "Mark read" : "Mark unread"}
                          onClick={() => {
                            setHoveredMessageId(msg.id);
                            setFocusedMessageId(msg.id);
                            toggleUnread(msg.id);
                          }}
                        >
                          {msg.unread ? (
                            <MailOpen className={styles.icon} aria-hidden="true" />
                          ) : (
                            <Mail className={styles.icon} aria-hidden="true" />
                          )}
                        </button>

                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.dangerButton}`}
                          aria-label={`Delete ${msg.subject}`}
                          title="Delete"
                          onClick={() => {
                            setHoveredMessageId(msg.id);
                            setFocusedMessageId(msg.id);
                            deleteMessage(msg.id);
                          }}
                        >
                          <Trash2 className={styles.icon} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <div className={styles.rightMeta}>
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
                        <div className={styles.date}>{new Date(msg.receivedAt).toLocaleString()}</div>
                      </div>
                    )}
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
                  <div className={styles.toLine}>
                    <span className={styles.metaLabel}>To:</span> {msg.to}
                  </div>
                  <div className={styles.downloadRow}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Download source ${msg.subject}`}
                      title="Download source (.eml)"
                      onClick={() => triggerDownload(`${msg.subject}.eml`, "message/rfc822", msg.rawSource)}
                    >
                      <FileDown className={styles.icon} aria-hidden="true" />
                    </button>

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

      {!composeOpen && (
        <button
          type="button"
          className={styles.fabCompose}
          aria-label="Compose"
          title="Compose"
          onClick={() => openCompose(savedDraft ?? { to: "", subject: "", body: "" })}
        >
          <Pencil className={styles.icon} aria-hidden="true" />
        </button>
      )}

      {mailboxPickerOpen && (
        <div
          id="mailbox-picker"
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Choose mailbox"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMailboxPickerOpen(false);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>Mailboxes</div>
              <button className={styles.sheetClose} type="button" aria-label="Close" onClick={() => setMailboxPickerOpen(false)}>
                <X className={styles.icon} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.sheetBody}>
              {demoMailboxes.map((m) => {
                const active = m.id === mailboxId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`${styles.sheetMailboxItem} ${active ? styles.sheetMailboxItemActive : ""}`}
                    onClick={() => setMailboxId(m.id)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={styles.mailboxName}>
                      <span className={styles.mailboxDuck} aria-hidden="true">
                        🦆
                      </span>{" "}
                      {m.name}
                    </span>
                    {m.unread > 0 && <span className={styles.unreadPill}>{m.unread}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {composeOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Compose email">
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
              <label className={styles.field}>
                Message
                <textarea
                  className={styles.textarea}
                  rows={10}
                  placeholder="Write your message..."
                  value={composeDraft.body}
                  onChange={(e) => setComposeDraft((prev) => ({ ...prev, body: e.target.value }))}
                />
              </label>

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
                <button className={styles.secondaryButton} type="button" onClick={closeCompose}>
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
                      setComposeOpen(false);
                      setComposeDraft({ to: "", subject: "", body: "" });
                      setSavedDraft(null);
                      setScheduleEnabled(false);
                      setScheduledFor("");
                      setSendMenuOpen(false);
                      setAttachments([]);
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
                          setSavedDraft(composeDraft);
                          setSendMenuOpen(false);
                          setComposeOpen(false);
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
                            requestAnimationFrame(() => scheduledForInputRef.current?.focus());
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
                            requestAnimationFrame(() => scheduledForInputRef.current?.focus());
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
    </main>
  );
}


