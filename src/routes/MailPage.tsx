import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import ThemeToggle from "../theme/ThemeToggle";
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

export default function MailPage() {
  const navigate = useNavigate();
  const [mailboxId, setMailboxId] = useState(demoMailboxes[0].id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({ to: "", subject: "", body: "" });
  const [messages, setMessages] = useState<Message[]>(() => demoMessages);

  const mailbox = useMemo(() => demoMailboxes.find((m) => m.id === mailboxId)!, [mailboxId]);

  useEffect(() => {
    // Switching mailbox should never keep old expanded state around.
    setExpandedIds(new Set());
  }, [mailboxId]);

  const openCompose = (draft?: Partial<ComposeDraft>) => {
    setComposeDraft((prev) => ({
      to: draft?.to ?? prev.to,
      subject: draft?.subject ?? prev.subject,
      body: draft?.body ?? prev.body
    }));
    setComposeOpen(true);
  };

  const toggleExpanded = (messageId: string) => {
    setExpandedIds((prev) => {
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

  const Icon = ({ title, children }: { title?: string; children: ReactNode }) => {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" role="img" aria-hidden={title ? undefined : true}>
        {title ? <title>{title}</title> : null}
        {children}
      </svg>
    );
  };

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Mailboxes">
        <div className={styles.brandRow}>
          <div className={styles.brand}>
            <span className={styles.brandDuck} aria-hidden="true">
              🦆
            </span>
            Duckwebmail
          </div>
          <div className={styles.sidebarActions}>
            <ThemeToggle />
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
          </div>

          <div className={styles.topbarCenter}>
            <label className={styles.searchLabel}>
              <span className={styles.srOnly}>Search</span>
              <input className={styles.search} placeholder="Search mail…" />
            </label>
          </div>

          <div className={styles.topbarRight}>
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
                          <Icon>
                            <path
                              d="M10 9V5l-8 7 8 7v-4.2c6 0 9.2 2 12 6.2-1-8-5-12-12-12z"
                              fill="currentColor"
                            />
                          </Icon>
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
                          <Icon>
                            <path
                              d="M14 9V5l8 7-8 7v-4.2c-6 0-9.2 2-12 6.2 1-8 5-12 12-12z"
                              fill="currentColor"
                            />
                          </Icon>
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
                          <Icon>
                            <path
                              d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z"
                              fill={msg.starred ? "currentColor" : "none"}
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                          </Icon>
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
                          <Icon>
                            {msg.unread ? (
                              <path
                                d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 2v.01L12 13 4 7.01V7h16z"
                                fill="currentColor"
                              />
                            ) : (
                              <path
                                d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 2l-8 6-8-6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}
                          </Icon>
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
                          <Icon>
                            <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" fill="currentColor" />
                          </Icon>
                        </button>
                      </div>
                    ) : (
                      <div className={styles.date}>{new Date(msg.receivedAt).toLocaleString()}</div>
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
                      <Icon>
                        <path
                          d="M4 4h12l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm11 1v4h4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinejoin="round"
                        />
                        <path d="M7 13h10M7 16h8M7 10h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </Icon>
                    </button>
                  </div>
                </div>

                {msg.attachments.length > 0 && (
                  <div className={styles.attachments} aria-label="Attachments">
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
                          <Icon>
                            <path
                              d="M12 3v10m0 0l4-4m-4 4l-4-4M5 17h14v4H5v-4z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </Icon>
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

      {composeOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Compose email">
          <div className={styles.modal} role="document">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>New email</div>
              <button className={styles.modalClose} type="button" aria-label="Close" onClick={() => setComposeOpen(false)}>
                ×
              </button>
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
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.secondaryButton} type="button" onClick={() => setComposeOpen(false)}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => {
                  setComposeOpen(false);
                  setComposeDraft({ to: "", subject: "", body: "" });
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


