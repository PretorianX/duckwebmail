import type { HTMLAttributes, MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Download,
  LoaderCircle,
  MoreHorizontal,
  Paperclip
} from "lucide-react";
import { formatSenderForList } from "../../../jmap/email";
import { normalizeBimiDomainKey } from "../../../jmap/bimi";
import SafeEmailViewer from "../../../shared/SafeEmailViewer";
import type { Message } from "../types";
import { formatListArrivalTime, getBimiInitial, formatBytes, triggerDownload } from "../utils";
import styles from "../../mail.module.css";

type MessageRowProps = {
  msg: Message;
  isOpen: boolean;
  activeProfileName: string;
  canDragEmails: boolean;
  bimiLogos: Map<string, string | null>;
  bodyLoading: boolean;
  bodyError: string | undefined;
  expandedAttachmentIds: Set<string>;
  expandedToIds: Set<string>;
  folderIdRef: MutableRefObject<string>;
  onToggleExpanded: (id: string) => void;
  onToggleAttachments: (id: string) => void;
  onToggleToIds: (id: string) => void;
  onRowActionsClick: (id: string) => void;
  onDragStart: (emailId: string, fromFolderId: string) => void;
  onDragEnd: () => void;
};

export function MessageRow({
  msg,
  isOpen,
  activeProfileName,
  canDragEmails,
  bimiLogos,
  bodyLoading,
  bodyError,
  expandedAttachmentIds,
  expandedToIds,
  folderIdRef,
  onToggleExpanded,
  onToggleAttachments,
  onToggleToIds,
  onRowActionsClick,
  onDragStart,
  onDragEnd
}: MessageRowProps) {
  const { t } = useTranslation();
  const regionId = `message-body-${msg.id}`;

  const senderEmail = msg.fromRaw?.[0]?.email;
  const domain = senderEmail ? normalizeBimiDomainKey(senderEmail) : null;
  const logoUrl = domain ? bimiLogos.get(domain) : null;

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
          onDragStart(msg.id, folderIdRef.current);
          e.dataTransfer.setData("application/x-duckwebmail-email", msg.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          if (!canDragEmails) return;
          onDragEnd();
        }}
        onClick={() => onToggleExpanded(msg.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpanded(msg.id);
          }
        }}
      >
        <div className={styles.rowGrid}>
          <div className={styles.bimi} data-col="icon" aria-hidden="true" title="BIMI">
            {logoUrl ? (
              <img src={logoUrl} alt="" className={styles.bimiLogo} />
            ) : (
              getBimiInitial(formatSenderForList(msg.fromRaw) || msg.from)
            )}
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
          <div
            className={`${styles.rightCell} ${isOpen ? styles.rightCellExpanded : ""}`}
            data-col="date"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.rightMeta}>
              {msg.hasAttachments && (
                <div
                  className={styles.attachmentIndicator}
                  aria-label={t("mail.hasAttachments")}
                  title={t("mail.hasAttachments")}
                >
                  <Paperclip className={styles.icon} aria-hidden="true" />
                </div>
              )}
              <div className={styles.date} title={new Date(msg.receivedAt).toLocaleString()}>
                {formatListArrivalTime(msg.receivedAt)}
              </div>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.moreButton}`}
                aria-label={t("mail.moreActionsSubject", { subject: msg.subject })}
                title={t("mail.moreActions")}
                onClick={() => onRowActionsClick(msg.id)}
              >
                <MoreHorizontal className={styles.icon} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className={styles.mobileActionButton}
              aria-label={t("mail.moreActionsSubject", { subject: msg.subject })}
              title={t("mail.moreActions")}
              onClick={() => onRowActionsClick(msg.id)}
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
            onClick={() => onToggleToIds(msg.id)}
          >
            <span className={styles.metaLabel}>{t("mail.to")}:</span>{" "}
            {expandedToIds.has(msg.id) ? msg.to : activeProfileName}
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
                onClick={() => onToggleAttachments(msg.id)}
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

        {bodyLoading ? (
          <div className={styles.bodyLoading} aria-live="polite">
            <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
            {t("mail.loadingMessage")}
          </div>
        ) : bodyError ? (
          <div className={styles.errorState} role="alert">
            {bodyError}
          </div>
        ) : (
          <div className={styles.emailBody}>
            <SafeEmailViewer htmlContent={msg.html ?? ""} textContent={msg.text ?? ""} />
          </div>
        )}
      </div>
    </div>
  );
}

