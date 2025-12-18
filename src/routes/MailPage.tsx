import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import ThemeToggle from "../theme/ThemeToggle";
import SafeEmailViewer from "../shared/SafeEmailViewer";
import styles from "./mail.module.css";

type Mailbox = { id: string; name: string; unread: number };
type Message = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
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
    subject: "Welcome",
    preview: "Welcome to RayMap Webmail — this is a demo message.",
    receivedAt: new Date().toISOString(),
    html: "<p><strong>Welcome</strong> to RayMap Webmail.</p><p>This expands inline as a full-width row.</p>"
  },
  {
    id: "m2",
    from: "Billing <billing@example.com>",
    subject: "Invoice #1234",
    preview: "Your invoice is ready. Please review.",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    text: "Invoice #1234\n\nThis is a plain text email demo."
  }
];

export default function MailPage() {
  const navigate = useNavigate();
  const [mailboxId, setMailboxId] = useState(demoMailboxes[0].id);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [composeOpen, setComposeOpen] = useState(false);

  const mailbox = useMemo(() => demoMailboxes.find((m) => m.id === mailboxId)!, [mailboxId]);

  useEffect(() => {
    // Switching mailbox should never keep old expanded state around.
    setExpandedIds(new Set());
  }, [mailboxId]);

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
              {mailbox.name} <span className={styles.count}>({demoMessages.length})</span>
            </div>
          </div>

          <div className={styles.topbarCenter}>
            <label className={styles.searchLabel}>
              <span className={styles.srOnly}>Search</span>
              <input className={styles.search} placeholder="Search mail…" />
            </label>
          </div>

          <div className={styles.topbarRight}>
            <button className={styles.composeButton} type="button" onClick={() => setComposeOpen(true)}>
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

        {demoMessages.map((msg) => {
          const isOpen = expandedIds.has(msg.id);
          const regionId = `message-body-${msg.id}`;
          return (
            <div key={msg.id} className={`${styles.rowGroup} ${isOpen ? styles.rowGroupOpen : ""}`}>
              <button
                className={`${styles.row} ${isOpen ? styles.rowOpen : ""}`}
                type="button"
                aria-expanded={isOpen}
                aria-controls={regionId}
                onClick={() => {
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(msg.id)) next.delete(msg.id);
                    else next.add(msg.id);
                    return next;
                  });
                }}
              >
                <div className={styles.rowGrid}>
                  <div className={styles.from}>{msg.from}</div>
                  <div className={styles.subject}>{msg.subject}</div>
                  <div className={styles.date}>{new Date(msg.receivedAt).toLocaleString()}</div>
                  <div className={styles.preview}>{msg.preview}</div>
                </div>
              </button>

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
              <button className={styles.modalClose} type="button" onClick={() => setComposeOpen(false)}>
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.field}>
                To
                <input className={styles.input} type="email" placeholder="recipient@example.com" />
              </label>
              <label className={styles.field}>
                Subject
                <input className={styles.input} type="text" placeholder="Subject" />
              </label>
              <label className={styles.field}>
                Message
                <textarea className={styles.textarea} rows={10} placeholder="Write your message..." />
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.secondaryButton} type="button" onClick={() => setComposeOpen(false)}>
                Cancel
              </button>
              <button className={styles.primaryButton} type="button" onClick={() => setComposeOpen(false)}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


